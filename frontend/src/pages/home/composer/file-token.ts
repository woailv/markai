/**
 * 兼容 shim:所有 file token 相关能力已下沉到通用 rich-editor 内核。
 * 本文件仅做 re-export,避免破坏历史 import 路径(如 file-context.ts)。
 *
 * 新代码请直接 `import { ... } from "@/components/rich-editor"`。
 */
export {
  FILE_TOKEN_REGEX,
  basename,
  decodeFileToken,
  documentToPlainText,
  encodeFileToken,
  hasFileToken,
} from "@/components/rich-editor"

export type { FileChipVariant } from "@/components/rich-editor"

// 以下 chip 插件保留导出,供个别外部消费者兼容;
// 业务侧现应通过 <RichEditor mode=... fileTokens={{enabled:true}} /> 使用,
// 而非直接引用具体变体。
import { createFileChipPlugin } from "@/components/rich-editor/file-chip"
export { createFileChipPlugin }
export const fileChipPlugin = createFileChipPlugin("editable")
export const readOnlyFileChipPlugin = createFileChipPlugin("readonly")
export const readOnlyInvertedFileChipPlugin =
  createFileChipPlugin("readonly-inverted")