import type { MessageFragmentDTO } from "@/../bindings/prompttool/internal/services/conversation/models"

/** 与后端 FragmentStatus 对应的可应用状态集合。 */
export function isApplyableStatus(status: string): boolean {
  return status === "pending" || status === "match_failed"
}

/** 修改类:实际会改动磁盘。 */
export function isModifyingKind(kind: string): boolean {
  switch (kind) {
    case "WRITE_FILE":
    case "EDIT_BLOCK":
    case "DELETE_FILE":
    case "MOVE_PATH":
    case "CREATE_DIRECTORY":
      return true
    default:
      return false
  }
}

/** 只读类:AI 用来"查看"内容,不改动磁盘。 */
export function isReadOnlyKind(kind: string): boolean {
  return kind === "REQUEST_FILE" || kind === "REQUEST_DIRECTORY_LIST"
}

/**
 * 从一组消息的 fragments 中抽出 REQUEST_FILE / REQUEST_DIRECTORY_LIST 的路径,
 * 按出现顺序去重。用于复制 AI 消息为 <files> 上下文时把 AI 想看的资源一并展开。
 */
export function extractRequestPathsFromFragments(
  messages: Array<{ fragments?: MessageFragmentDTO[] | null }>,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of messages) {
    for (const f of m.fragments ?? []) {
      if (!isReadOnlyKind(f.kind)) continue
      const p = f.path
      if (!p || seen.has(p)) continue
      seen.add(p)
      out.push(p)
    }
  }
  return out
}

/**
 * 与 extractRequestPathsFromFragments 一致,但按 kind 分组返回:
 * - files: 来自 REQUEST_FILE 的路径,用 <files> 展开
 * - dirs:  来自 REQUEST_DIRECTORY_LIST 的路径,用目录路径列表标签展开
 * 两组内部各自按出现顺序去重;跨组同路径互不影响。
 */
export function extractRequestPathsByKindFromFragments(
  messages: Array<{ fragments?: MessageFragmentDTO[] | null }>,
): { files: string[]; dirs: string[] } {
  const fileSeen = new Set<string>()
  const dirSeen = new Set<string>()
  const files: string[] = []
  const dirs: string[] = []
  for (const m of messages) {
    for (const f of m.fragments ?? []) {
      const p = f.path
      if (!p) continue
      if (f.kind === "REQUEST_FILE") {
        if (fileSeen.has(p)) continue
        fileSeen.add(p)
        files.push(p)
      } else if (f.kind === "REQUEST_DIRECTORY_LIST") {
        if (dirSeen.has(p)) continue
        dirSeen.add(p)
        dirs.push(p)
      }
    }
  }
  return { files, dirs }
}
