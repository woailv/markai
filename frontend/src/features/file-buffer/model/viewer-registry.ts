/**
 * 文件类型判定:根据扩展名决定该用哪种 viewer。
 * text  → CodeMirror 编辑器(默认)
 * image → 只读 <img>
 * binary → 只读提示(v1 不做进一步处理)
 */
export type ViewerKind = "text" | "image" | "binary"

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "svg",
  "ico",
])

// 已知的二进制/不建议直接文本编辑的扩展名
const BINARY_EXTS = new Set([
  "pdf",
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "exe",
  "dll",
  "so",
  "dylib",
  "class",
  "jar",
  "wasm",
  "mp3",
  "mp4",
  "mov",
  "avi",
  "wav",
  "flac",
  "psd",
  "ai",
  "sketch",
])

function extOf(path: string): string {
  const idx = path.lastIndexOf(".")
  if (idx < 0) return ""
  return path.slice(idx + 1).toLowerCase()
}

export function classifyPath(path: string): ViewerKind {
  const ext = extOf(path)
  if (IMAGE_EXTS.has(ext)) return "image"
  if (BINARY_EXTS.has(ext)) return "binary"
  return "text"
}

/**
 * 根据扩展名映射到 CodeMirror language mode。
 * 目前只强制 markdown 使用 @codemirror/lang-markdown,其他扩展未安装对应
 * language 包(见 package.json),交给纯文本模式即可,不做过度加载。
 */
export function languageIdOf(path: string): "markdown" | "plaintext" {
  const ext = extOf(path)
  if (ext === "md" || ext === "markdown" || ext === "mdx") return "markdown"
  return "plaintext"
}

/** 便捷:判断是否为图片(用于 file-panel 直接渲染 img)。 */
export function isImagePath(path: string): boolean {
  return classifyPath(path) === "image"
}