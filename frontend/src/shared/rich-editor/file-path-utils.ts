/**
 * 文件 token 通用工具：路径解析、正则、路径提取。
 * 供 rich-editor 内核 与 业务侧(如复制全部时的 file-context 构建) 共用,
 * 避免正则在多处重复维护。
 *
 * 文件引用 token 的编码格式(通用 Markdown 文件引用):
 *
 *   [@<basename>](file:///<absolute-path>)
 *
 * 例如: [@index.tsx](file:///E:/goproject/prompttool/frontend/src/pages/home/index.tsx)
 */

/** 全局匹配所有 file token,捕获组 1 为绝对路径 */
export const FILE_TOKEN_REGEX =
  /\[@[^\]\n]+\]\(file:\/\/\/([^)\n]+)\)/g

/** 将绝对路径规范化为 URL 中的正斜杠形式(仅用于文档中的 token 编码) */
export function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/")
}

/** 提取路径的 basename(兼容 Windows 与 POSIX 分隔符) */
export function basename(p: string): string {
  const normalized = p.replace(/[\\/]+$/, "")
  const idx = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  )
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

/** 编码为文档 token(Markdown 引用形式) */
export function encodeFileToken(absolutePath: string): string {
  const name = basename(absolutePath)
  return `[@${name}](file:///${toForwardSlash(absolutePath).replace(/^\/+/, "")})`
}

/** 从 token 字符串中解出路径,未整体匹配返回 null */
export function decodeFileToken(token: string): string | null {
  const re = new RegExp(FILE_TOKEN_REGEX.source)
  const m = re.exec(token)
  if (!m) return null
  if (m[0] !== token) return null
  return m[1]
}

/** 判断输入是否包含 token */
export function hasFileToken(doc: string): boolean {
  const re = new RegExp(FILE_TOKEN_REGEX.source, "g")
  return re.test(doc)
}

/**
 * 从多条文本中按出现顺序去重抽取所有文件 token 的绝对路径。
 */
export function extractFilePaths(contents: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const content of contents) {
    const re = new RegExp(FILE_TOKEN_REGEX.source, "g")
    let m: RegExpExecArray | null
    while ((m = re.exec(content))) {
      const p = m[1]
      if (!seen.has(p)) {
        seen.add(p)
        result.push(p)
      }
    }
  }
  return result
}

/**
 * 得到真实要发送的文本。文档中的 token 本身即为通用 Markdown 引用格式,
 * 直接原样返回,下游可自行解析或保留。
 */
export function documentToPlainText(doc: string): string {
  return doc
}