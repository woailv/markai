/**
 * 模板引用 token 通用工具:与 file-path-utils 结构对齐。
 *
 * token 编码格式(Markdown 链接语法):
 *   [#<模板名>](template:///<id>)
 *
 * 例:  [#代码审查](template:///12)
 *
 * 说明:
 * - 与 FILE_TOKEN_REGEX 使用相同风格,便于 chip 装饰复用套路
 * - 模板名允许包含空格与中文,但不允许出现 ']' 与换行
 */

/** 全局匹配所有 template token,捕获组 1 为名字,捕获组 2 为数字 id */
export const TEMPLATE_TOKEN_REGEX =
  /\[#([^\]\n]+)\]\(template:\/\/\/(\d+)\)/g

export interface TemplateTokenRef {
  id: number
  name: string
}

/** 编码为文档 token */
export function encodeTemplateToken(id: number, name: string): string {
  // 兜底:去掉 ']' 与换行,防止破坏 markdown 结构
  const safe = name.replace(/[\]\n\r]/g, " ").trim() || `模板${id}`
  return `[#${safe}](template:///${id})`
}

/** 从 token 字符串中解出 {id, name},未整体匹配返回 null */
export function decodeTemplateToken(token: string): TemplateTokenRef | null {
  const re = new RegExp(TEMPLATE_TOKEN_REGEX.source)
  const m = re.exec(token)
  if (!m) return null
  if (m[0] !== token) return null
  return { id: Number(m[2]), name: m[1] }
}

/** 判断输入是否包含 template token */
export function hasTemplateToken(doc: string): boolean {
  const re = new RegExp(TEMPLATE_TOKEN_REGEX.source, "g")
  return re.test(doc)
}

/**
 * 从多条文本中按出现顺序抽取所有 template token(去重,按 id)。
 */
export function extractTemplateRefs(contents: string[]): TemplateTokenRef[] {
  const seen = new Set<number>()
  const result: TemplateTokenRef[] = []
  for (const content of contents) {
    const re = new RegExp(TEMPLATE_TOKEN_REGEX.source, "g")
    let m: RegExpExecArray | null
    while ((m = re.exec(content))) {
      const id = Number(m[2])
      if (!seen.has(id)) {
        seen.add(id)
        result.push({ id, name: m[1] })
      }
    }
  }
  return result
}