/**
 * AI 指令解析器
 *
 * 从消息文本中提取 XML 风格的文件操作指令。
 * 支持的标签(与 index.tsx 中 COMMAND_TAG_RE 一致):
 *   - <WRITE_FILE path="ABS">...```lang\n代码\n```...</WRITE_FILE>
 *   - <EDIT_FILE path="ABS">
 *       多个:
 *       ```lang
 *       <<<<<<< SEARCH
 *       ...
 *       =======
 *       ...
 *       >>>>>>> REPLACE
 *       ```
 *     </EDIT_FILE>
 *   - <DELETE_FILE path="ABS"/>
 *   - <MOVE_PATH source_path="ABS" destination_path="ABS"/>
 *   - <CREATE_DIRECTORY path="ABS"/>
 *   - <REQUEST_DIRECTORY_LIST path="ABS"/>
 *   - <REQUEST_FILE path="ABS"/>
 *
 * 解析策略:
 *   - 使用带 tagName 捕获的整体正则,一次扫描,严格按出现顺序返回。
 *   - 自闭合(尾部 `/>`)与开合对(`>...</TAG>`)统一处理。
 *   - WRITE_FILE / EDIT_FILE 的正文再走各自的次级解析。
 */

/** 所有受支持的指令标签名。作为单一事实源,派生类型与运行时正则均以此为准。 */
export const COMMAND_TAG_NAMES = [
    "WRITE_FILE",
    "EDIT_FILE",
    "DELETE_FILE",
    "MOVE_PATH",
    "CREATE_DIRECTORY",
    "REQUEST_DIRECTORY_LIST",
    "REQUEST_FILE",
] as const

export type CommandKind = (typeof COMMAND_TAG_NAMES)[number]

/** 用于在正则中匹配任一指令标签名的 alternation 片段。 */
const COMMAND_TAG_ALTERNATION = COMMAND_TAG_NAMES.join("|")

/**
 * 快速检测:文本中是否包含形如 `<TAG ` / `<TAG>` / `<TAG/>` 的指令标签头。
 * 用于上层判定"这条消息是否为 AI 编辑协议消息",不要求完整解析。
 */
export const COMMAND_TAG_DETECT_RE = new RegExp(
    `<(?:${COMMAND_TAG_ALTERNATION})(?=[\\s/>])`,
)

export interface SearchReplaceBlock {
    search: string
    replace: string
}

export interface WriteFileCommand {
    kind: "WRITE_FILE"
    path: string
    content: string
}

export interface EditFileCommand {
    kind: "EDIT_FILE"
    path: string
    edits: SearchReplaceBlock[]
}

export interface DeleteFileCommand {
    kind: "DELETE_FILE"
    path: string
}

export interface MovePathCommand {
    kind: "MOVE_PATH"
    source: string
    destination: string
}

export interface CreateDirectoryCommand {
    kind: "CREATE_DIRECTORY"
    path: string
}

export interface RequestDirectoryListCommand {
    kind: "REQUEST_DIRECTORY_LIST"
    path: string
}

export interface RequestFileCommand {
    kind: "REQUEST_FILE"
    path: string
}

export type ParsedCommand =
    | WriteFileCommand
    | EditFileCommand
    | DeleteFileCommand
    | MovePathCommand
    | CreateDirectoryCommand
    | RequestDirectoryListCommand
    | RequestFileCommand

export interface ParseError {
    kind: "PARSE_ERROR"
    raw: string
    message: string
}

export type ParseItem = ParsedCommand | ParseError

/** 带原文位置区间的解析结果,用于严格内联切片渲染 */
export interface ParseItemWithRange {
    item: ParseItem
    /** 在原始文本中的字节区间 [start, end) */
    start: number
    end: number
}

/** 匹配一个完整的指令标签块(自闭合或成对) */
const COMMAND_BLOCK_RE = new RegExp(
    `<(${COMMAND_TAG_ALTERNATION})\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/\\1\\s*>)`,
    "g",
)

/** 提取标签属性 name="value" 或 name='value' */
function parseAttrs(raw: string): Record<string, string> {
    const attrs: Record<string, string> = {}
    const re = /(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*'([^']*)'/g
    let m: RegExpExecArray | null
    while ((m = re.exec(raw))) {
        const key = m[1] ?? m[3]
        const val = m[2] ?? m[4] ?? ""
        if (key) attrs[key] = val
    }
    return attrs
}

/**
 * 从一段可能包含 ```lang\n...\n``` 围栏的正文中提取纯代码。
 * 若无围栏,原样返回(trim 首尾空行)。
 */
function extractCodeFence(body: string): string {
    const fence = /```[^\n]*\n([\s\S]*?)\n```/m.exec(body)
    if (fence) return fence[1]
    return body.replace(/^\n+/, "").replace(/\n+$/, "")
}

/**
 * 解析 EDIT_FILE 正文中的多个 SEARCH/REPLACE 块。
 * 允许它们被单个 ``` 围栏包裹,或散落多个围栏。
 *
 * 健壮性要点:
 * - 先把 CRLF 归一为 LF,避免 AI 输出与文件混合换行时 SEARCH 内容尾部带 \r
 * - 分隔符行允许行尾有额外空白(部分模型会补空格),但字符数严格要求 7 个
 * - SEARCH / REPLACE 段允许为空(用于纯新增或纯删除)
 * - REPLACE 结尾允许缺少换行(紧贴 `>>>>>>> REPLACE` 之前)
 */
function parseSearchReplaceBlocks(body: string): SearchReplaceBlock[] {
    const normalized = body.replace(/\r\n/g, "\n")
    const blocks: SearchReplaceBlock[] = []
    // 分隔符必须独占一行(前面是行首或换行,后面是行尾空白+换行),
    // 但段内容允许为空、允许尾部无换行(REPLACE 段用 (?=\s|$) 收尾)。
    const re =
        /<{7}[ \t]*SEARCH[ \t]*\n([\s\S]*?)\n={7}[ \t]*\n([\s\S]*?)\n?>{7}[ \t]*REPLACE(?=\s|$)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(normalized))) {
        blocks.push({ search: m[1], replace: m[2] })
    }
    return blocks
}

export function parseCommands(text: string): ParseItem[] {
    return parseCommandsWithRanges(text).map((x) => x.item)
}

/**
 * 与 parseCommands 语义一致,但额外返回每条指令在原文中的字节区间。
 * 用于严格内联切片渲染:文本段 = 相邻区间之间的原文,指令段 = 命中区间。
 */
export function parseCommandsWithRanges(text: string): ParseItemWithRange[] {
    const out: ParseItemWithRange[] = []
    COMMAND_BLOCK_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = COMMAND_BLOCK_RE.exec(text))) {
        const [full, tag, attrRaw, inner] = m
        const attrs = parseAttrs(attrRaw || "")
        const kind = tag as CommandKind
        const start = m.index
        const end = m.index + full.length

        try {
            let parsed: ParsedCommand
            switch (kind) {
                case "WRITE_FILE": {
                    const path = requireAttr(attrs, "path", tag)
                    const content = extractCodeFence(inner ?? "")
                    parsed = { kind, path, content }
                    break
                }
                case "EDIT_FILE": {
                    const path = requireAttr(attrs, "path", tag)
                    const edits = parseSearchReplaceBlocks(inner ?? "")
                    if (edits.length === 0) {
                        throw new Error("EDIT_FILE 未包含任何 SEARCH/REPLACE 块")
                    }
                    parsed = { kind, path, edits }
                    break
                }
                case "DELETE_FILE": {
                    const path = requireAttr(attrs, "path", tag)
                    parsed = { kind, path }
                    break
                }
                case "MOVE_PATH": {
                    const source = requireAttr(attrs, "source_path", tag)
                    const destination = requireAttr(attrs, "destination_path", tag)
                    parsed = { kind, source, destination }
                    break
                }
                case "CREATE_DIRECTORY": {
                    const path = requireAttr(attrs, "path", tag)
                    parsed = { kind, path }
                    break
                }
                case "REQUEST_DIRECTORY_LIST": {
                    const path = requireAttr(attrs, "path", tag)
                    parsed = { kind, path }
                    break
                }
                case "REQUEST_FILE": {
                    const path = requireAttr(attrs, "path", tag)
                    parsed = { kind, path }
                    break
                }
                default: {
                    // 类型系统上不可能到达,但兜底避免未初始化
                    throw new Error(`未知指令: ${tag}`)
                }
            }
            out.push({ item: parsed, start, end })
        } catch (e) {
            out.push({
                item: {
                    kind: "PARSE_ERROR",
                    raw: full,
                    message: e instanceof Error ? e.message : String(e),
                },
                start,
                end,
            })
        }
    }
    return out
}

function requireAttr(
    attrs: Record<string, string>,
    key: string,
    tag: string,
): string {
    const v = attrs[key]?.trim()
    if (!v) throw new Error(`<${tag}> 缺少必需属性 ${key}`)
    return v
}