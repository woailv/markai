import { FileService } from "@/../bindings/prompttool/internal/services/file"
import type { FileEntry } from "@/../bindings/prompttool/internal/services/file/models"
import type { MessageFragmentDTO } from "@/../bindings/prompttool/internal/services/conversation/models"

import { FILE_TOKEN_REGEX } from "@/shared/rich-editor"
import {
  extractRequestPathsFromFragments,
  extractRequestPathsByKindFromFragments,
} from "@/entities/exec-command"

/**
 * 从一段消息文本中抽取所有文件 token 的绝对路径,按出现顺序去重。
 */
export function extractFilePathsFromMessages(contents: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const content of contents) {
    FILE_TOKEN_REGEX.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = FILE_TOKEN_REGEX.exec(content))) {
      const path = normalizePath(m[1])
      if (!seen.has(path)) {
        seen.add(path)
        result.push(path)
      }
    }
  }
  return result
}

/**
 * 从消息里抽取 REQUEST_FILE / REQUEST_DIRECTORY_LIST 的路径,按出现顺序去重。
 * 用于复制 AI 消息时,将 AI 想看的资源展开成 <files> 上下文。
 *
 * 新架构下 AI 指令由后端解析并落成 fragments,前端从每条消息的 fragments 里读取即可。
 */
export function extractRequestPathsFromMessages(
  messages: Array<{ fragments?: MessageFragmentDTO[] | null }>,
): string[] {
  const paths = extractRequestPathsFromFragments(messages)
  return paths.map(normalizePath)
}

/**
 * 与 extractRequestPathsFromMessages 一致,但按 kind 拆成两组返回,
 * 便于对 REQUEST_FILE(展开文件内容)与 REQUEST_DIRECTORY_LIST(仅列路径)
 * 走两条不同的组装流程。
 */
export function extractRequestPathsByKindFromMessages(
  messages: Array<{ fragments?: MessageFragmentDTO[] | null }>,
): { files: string[]; dirs: string[] } {
  const { files, dirs } = extractRequestPathsByKindFromFragments(messages)
  return {
    files: files.map(normalizePath),
    dirs: dirs.map(normalizePath),
  }
}

/** 将 URL 形式的正斜杠路径还原为本机路径(Windows 使用反斜杠) */
function normalizePath(p: string): string {
  return p
}

/** 扩展名 → 代码块语言标签 */
const LANG_MAP: Record<string, string> = {
  go: "go",
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  mjs: "js",
  cjs: "js",
  py: "python",
  rb: "ruby",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  ps1: "powershell",
  bat: "batch",
  json: "json",
  json5: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  md: "markdown",
  markdown: "markdown",
  sql: "sql",
  vue: "vue",
  svelte: "svelte",
  dart: "dart",
  lua: "lua",
  ini: "ini",
  env: "bash",
  proto: "protobuf",
  dockerfile: "dockerfile",
}

function detectLang(path: string): string {
  const lower = path.toLowerCase()
  const slash = Math.max(lower.lastIndexOf("/"), lower.lastIndexOf("\\"))
  const name = slash >= 0 ? lower.slice(slash + 1) : lower
  if (name === "dockerfile") return "dockerfile"
  if (name === "makefile") return "makefile"
  const dot = name.lastIndexOf(".")
  if (dot < 0) return ""
  const ext = name.slice(dot + 1)
  return LANG_MAP[ext] ?? ""
}

/** 单个文件的读取结果 */
interface CollectedFile {
  path: string
  content: string
}

/**
 * 递归展开路径:
 * - 若是文件,读取其内容
 * - 若是目录,递归列出所有子文件并读取
 * 失败的条目会以错误信息占位,不中断整体流程。
 */
async function collectPath(
  path: string,
  visited: Set<string>,
): Promise<CollectedFile[]> {
  if (visited.has(path)) return []
  visited.add(path)

  // 先尝试作为文件读取;若失败(通常是目录或权限问题),回退到目录遍历
  try {
    const res = await FileService.Read(path)
    if (res) {
      return [{ path: res.path || path, content: res.content }]
    }
  } catch {
    // 落到目录处理
  }

  try {
    const entries = (await FileService.List(path)) ?? []
    return await collectFromEntries(entries, visited)
  } catch (err) {
    return [
      {
        path,
        content: `// [无法读取: ${(err as Error)?.message ?? "unknown error"}]`,
      },
    ]
  }
}

async function collectFromEntries(
  entries: FileEntry[],
  visited: Set<string>,
): Promise<CollectedFile[]> {
  const out: CollectedFile[] = []
  for (const entry of entries) {
    if (entry.isDir) {
      const sub = await collectPath(entry.path, visited)
      out.push(...sub)
    } else {
      if (visited.has(entry.path)) continue
      visited.add(entry.path)
      try {
        const res = await FileService.Read(entry.path)
        if (res) {
          out.push({ path: res.path || entry.path, content: res.content })
        }
      } catch (err) {
        out.push({
          path: entry.path,
          content: `// [无法读取: ${(err as Error)?.message ?? "unknown error"}]`,
        })
      }
    }
  }
  return out
}

/**
 * 收集给定路径集合下所有文件内容,并渲染为
 * <files>
 * ```lang path
 * content
 * ```
 * ...
 * </files>
 * 若没有可收集的文件,返回空字符串。
 */
export async function buildFilesContext(paths: string[]): Promise<string> {
  if (paths.length === 0) return ""
  const visited = new Set<string>()
  const all: CollectedFile[] = []
  for (const p of paths) {
    const files = await collectPath(p, visited)
    all.push(...files)
  }
  if (all.length === 0) return ""

  const parts = all.map((f) => {
    const lang = detectLang(f.path)
    const header = lang ? `${lang} ${f.path}` : f.path
    // 使用足够长的围栏以避免与文件内部的 ``` 冲突
    const fence = pickFence(f.content)
    return `${fence}${header}\n${f.content}\n${fence}`
  })

  return `<files>\n${parts.join("\n\n")}\n</files>`
}

/** 选择一个不会与内容冲突的代码围栏(至少 3 个反引号,若内容中存在更长的则再加长) */
function pickFence(content: string): string {
  let max = 2
  const re = /`{3,}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    if (m[0].length > max) max = m[0].length
  }
  return "`".repeat(Math.max(3, max + 1))
}

/**
 * 递归收集目录下所有文件的绝对路径(不含目录自身),深度不限。
 * 与 collectPath 不同:此处只登记路径,不读取文件内容。
 * 单个条目失败不会中断整体流程,失败信息会以注释形式追加。
 */
async function listAllFilePaths(
  dir: string,
  visited: Set<string>,
  out: string[],
  errors: string[],
): Promise<void> {
  if (visited.has(dir)) return
  visited.add(dir)
  try {
    const entries = (await FileService.List(dir)) ?? []
    for (const entry of entries) {
      if (entry.isDir) {
        await listAllFilePaths(entry.path, visited, out, errors)
      } else {
        if (!visited.has(entry.path)) {
          visited.add(entry.path)
          out.push(entry.path)
        }
      }
    }
  } catch (err) {
    errors.push(
      `// [无法列出目录 ${dir}: ${(err as Error)?.message ?? "unknown error"}]`,
    )
  }
}

/**
 * 将 REQUEST_DIRECTORY_LIST 请求的目录展开为路径列表上下文:
 * <file_paths>
 *   <dir path="/abs/dir">
 *     /abs/dir/a.ts
 *     /abs/dir/sub/b.ts
 *   </dir>
 *   ...
 * </file_paths>
 * 无有效目录或全部为空时返回空字符串。
 */
export async function buildDirectoryListingsContext(
  dirs: string[],
): Promise<string> {
  if (dirs.length === 0) return ""
  const sections: string[] = []
  for (const d of dirs) {
    const visited = new Set<string>()
    const paths: string[] = []
    const errors: string[] = []
    await listAllFilePaths(d, visited, paths, errors)
    const bodyLines = [...paths, ...errors]
    if (bodyLines.length === 0) {
      sections.push(`  <dir path="${d}">\n  </dir>`)
      continue
    }
    const indented = bodyLines.map((l) => `    ${l}`).join("\n")
    sections.push(`  <dir path="${d}">\n${indented}\n  </dir>`)
  }
  if (sections.length === 0) return ""
  return `<file_paths>\n${sections.join("\n")}\n</file_paths>`
}
