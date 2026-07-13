import { FileService } from "@/../bindings/prompttool/internal/services"

import type {
  EditFileCommand,
  ParseItem,
  ParsedCommand,
} from "./command-parser"
import { confirmDestructive } from "./confirm-dialog"

/**
 * 指令执行器
 *
 * 输入:parseCommands() 产出的 ParseItem[]
 * 输出:ExecutionReport,含每条的状态、耗时与摘要,便于结构化回执渲染。
 *
 * 语义要点:
 * - 顺序 await,任一 error 状态即中断,后续条目标记为 skipped
 * - 破坏性场景弹出确认;拒绝 → cancelled,不中断后续(用户明确的选择)
 * - EDIT_FILE 在前端组合"读→逐块替换→写"实现 SEARCH/REPLACE 语义,
 *   SEARCH 块必须精确匹配且唯一,否则该指令失败。
 */

export type ExecStatus = "success" | "error" | "cancelled" | "skipped"

export interface ExecResultBase {
  kind: string
  status: ExecStatus
  /** 一句话摘要,用于回执主行 */
  summary: string
  /** 详情:失败原因、diff、返回数据等 */
  detail?: string
  /** 主路径,用于等宽字体渲染 */
  path?: string
  durationMs: number
}

export interface ExecutionReport {
  results: ExecResultBase[]
  aborted: boolean
}

export async function executeCommands(
  items: ParseItem[],
): Promise<ExecutionReport> {
  const results: ExecResultBase[] = []
  let aborted = false

  for (const item of items) {
    if (aborted) {
      results.push({
        kind: item.kind === "PARSE_ERROR" ? "PARSE_ERROR" : item.kind,
        status: "skipped",
        summary: "已跳过(前序指令失败)",
        durationMs: 0,
        path: "path" in item ? item.path : undefined,
      })
      continue
    }

    if (item.kind === "PARSE_ERROR") {
      results.push({
        kind: "PARSE_ERROR",
        status: "error",
        summary: "解析失败",
        detail: item.message,
        durationMs: 0,
      })
      aborted = true
      continue
    }

    const started = performance.now()
    try {
      const r = await runOne(item)
      r.durationMs = Math.round(performance.now() - started)
      results.push(r)
      if (r.status === "error") aborted = true
    } catch (e) {
      results.push({
        kind: item.kind,
        status: "error",
        summary: "执行异常",
        detail: e instanceof Error ? e.message : String(e),
        path: "path" in item ? item.path : undefined,
        durationMs: Math.round(performance.now() - started),
      })
      aborted = true
    }
  }

  return { results, aborted }
}

async function runOne(cmd: ParsedCommand): Promise<ExecResultBase> {
  switch (cmd.kind) {
    case "WRITE_FILE": {
      // 检测是否覆盖已有文件 → 需确认
      const existing = await tryRead(cmd.path)
      if (existing !== null) {
        const ok = await confirmDestructive({
          title: "覆盖已有文件",
          description: "该文件已存在,继续将覆盖原有内容。",
          path: cmd.path,
          destructiveLabel: "覆盖",
        })
        if (!ok) {
          return {
            kind: cmd.kind,
            status: "cancelled",
            summary: "用户取消覆盖",
            path: cmd.path,
            durationMs: 0,
          }
        }
      }
      const result = await FileService.Write({
        path: cmd.path,
        content: cmd.content,
      })
      return {
        kind: cmd.kind,
        status: "success",
        summary: result?.created ? "新建文件" : "写入(覆盖)",
        path: cmd.path,
        detail: result?.diff,
        durationMs: 0,
      }
    }

    case "EDIT_FILE": {
      const readRes = await FileService.Read(cmd.path)
      if (!readRes) {
        return {
          kind: cmd.kind,
          status: "error",
          summary: "读取失败",
          detail: "无法读取文件内容",
          path: cmd.path,
          durationMs: 0,
        }
      }
      const applied = applyEdits(readRes.content, cmd)
      if (!applied.ok) {
        return {
          kind: cmd.kind,
          status: "error",
          summary: `编辑失败(第 ${applied.failedAt + 1} 块)`,
          detail: applied.reason,
          path: cmd.path,
          durationMs: 0,
        }
      }
      await FileService.Write({ path: cmd.path, content: applied.content })
      return {
        kind: cmd.kind,
        status: "success",
        summary: `应用 ${cmd.edits.length} 处编辑`,
        path: cmd.path,
        durationMs: 0,
      }
    }

    case "DELETE_FILE": {
      const ok = await confirmDestructive({
        title: "删除文件/目录",
        description: "该操作不可恢复。",
        path: cmd.path,
        destructiveLabel: "删除",
      })
      if (!ok) {
        return {
          kind: cmd.kind,
          status: "cancelled",
          summary: "用户取消删除",
          path: cmd.path,
          durationMs: 0,
        }
      }
      await FileService.Delete(cmd.path)
      return {
        kind: cmd.kind,
        status: "success",
        summary: "已删除",
        path: cmd.path,
        durationMs: 0,
      }
    }

    case "MOVE_PATH": {
      // 若目标已存在,需要确认(后端也会拒绝,但提前告知更友好)
      const dstExisting = await tryRead(cmd.destination)
      if (dstExisting !== null) {
        return {
          kind: cmd.kind,
          status: "error",
          summary: "目标已存在",
          detail: `目标路径已存在文件: ${cmd.destination}`,
          path: cmd.destination,
          durationMs: 0,
        }
      }
      await FileService.Move({
        source: cmd.source,
        destination: cmd.destination,
      })
      return {
        kind: cmd.kind,
        status: "success",
        summary: "已移动",
        path: `${cmd.source} → ${cmd.destination}`,
        durationMs: 0,
      }
    }

    case "CREATE_DIRECTORY": {
      await FileService.CreateDirectory(cmd.path)
      return {
        kind: cmd.kind,
        status: "success",
        summary: "已创建目录",
        path: cmd.path,
        durationMs: 0,
      }
    }

    case "REQUEST_DIRECTORY_LIST": {
      const list = await FileService.List(cmd.path)
      const lines = (list ?? []).map(
        (e) => `${e.isDir ? "d" : "-"} ${e.name}`,
      )
      return {
        kind: cmd.kind,
        status: "success",
        summary: `列出 ${lines.length} 项`,
        path: cmd.path,
        detail: lines.join("\n"),
        durationMs: 0,
      }
    }

    case "REQUEST_FILE": {
      const r = await FileService.Read(cmd.path)
      return {
        kind: cmd.kind,
        status: "success",
        summary: `读取 ${r?.size ?? 0} 字节`,
        path: cmd.path,
        detail: r?.content ?? "",
        durationMs: 0,
      }
    }
  }
}

/** 尝试读取文件;不存在 / 出错都返回 null,不抛出 */
async function tryRead(path: string): Promise<string | null> {
  try {
    const r = await FileService.Read(path)
    return r?.content ?? null
  } catch {
    return null
  }
}

/**
 * 依次应用 SEARCH/REPLACE 块。
 * 规则:
 *   - SEARCH 必须在当前文本中出现且仅出现一次
 *   - 空 SEARCH 视为在文件末尾追加 REPLACE
 */
function applyEdits(
  original: string,
  cmd: EditFileCommand,
):
  | { ok: true; content: string }
  | { ok: false; failedAt: number; reason: string } {
  let content = original
  for (let i = 0; i < cmd.edits.length; i++) {
    const { search, replace } = cmd.edits[i]
    if (search === "") {
      content = content + replace
      continue
    }
    const first = content.indexOf(search)
    if (first === -1) {
      return {
        ok: false,
        failedAt: i,
        reason: "SEARCH 块未在文件中找到精确匹配",
      }
    }
    const second = content.indexOf(search, first + search.length)
    if (second !== -1) {
      return {
        ok: false,
        failedAt: i,
        reason: "SEARCH 块在文件中出现多次,请补充上下文以保证唯一性",
      }
    }
    content =
      content.slice(0, first) + replace + content.slice(first + search.length)
  }
  return { ok: true, content }
}