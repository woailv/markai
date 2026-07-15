import { Check, Copy, Loader2, Trash2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import {
  buildFilesContext,
  extractFilePathsFromMessages,
} from "./file-context"
import { buildTemplatesContext } from "./template-context"
import type { ChatMessage, Template } from "./types"

interface ChatToolbarProps {
  messages: ChatMessage[]
  onClear: () => void
  /** @deprecated 历史会话切换已迁移到页面底部状态栏,此 prop 保留以兼容旧调用。 */
  onOpenHistory?: () => void
  templates: Template[]
}

/**
 * 会话工具条:历史 / 复制全部 / 更多(清空)
 * - 复制/清空 在无消息时禁用
 * - 清空需二次确认,防止误操作
 */
export function ChatToolbar({
  messages,
  onClear,
  templates,
}: ChatToolbarProps) {
  const [copied, setCopied] = useState(false)
  const [copying, setCopying] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const hasMessages = messages.length > 0

  const handleCopyAll = async () => {
    if (!hasMessages || copying) return
    setCopying(true)
    try {
      const conversation = messages
        .map(
          (m) =>
            `**${m.role === "user" ? "User" : "Assistant"}**:\n\n${m.content}`,
        )
        .join("\n\n---\n\n")

      // 从所有消息中收集文件 token 路径,展开为 <files>...</files> 上下文
      const paths = extractFilePathsFromMessages(messages.map((m) => m.content))
      const filesContext = await buildFilesContext(paths)

      // 展开模板 token 为 <templates>...</templates> 上下文
      const templatesContext = buildTemplatesContext(
        messages.map((m) => m.content),
        templates,
      )

      // 顺序: templates → files → 对话
      const prefixes = [templatesContext, filesContext].filter(
        (s) => s.length > 0,
      )
      let finalText =
        prefixes.length > 0
          ? `${prefixes.join("\n\n")}\n\n${conversation}`
          : conversation

      // 若最后一条消息是用户发送的，则追加 Assistant 的答复引导后缀
      if (messages[messages.length - 1].role === "user") {
        finalText += "\n\n---\n\nPlease provide the assistant's response:"
      }

      await navigator.clipboard.writeText(finalText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error("复制失败:", err)
      throw err
    } finally {
      setCopying(false)
    }
  }

  const handleClearClick = () => {
    setConfirmOpen(true)
  }

  const handleConfirmClear = () => {
    onClear()
    setConfirmOpen(false)
  }

  return (
    <div className="flex items-center gap-0.5">
      <span className="mr-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        {messages.length} 条
      </span>

      {/* 复制全部 */}
      <div className="relative">
        <IconButton
          title={
            copying ? "正在收集文件..." : copied ? "已复制" : "复制全部(含文件内容)"
          }
          onClick={handleCopyAll}
          disabled={!hasMessages || copying}
          highlighted={copied}
        >
          {copying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </IconButton>
        {copied && (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2",
              "flex items-center gap-1 whitespace-nowrap rounded-md",
              "bg-foreground px-2 py-1 text-[11px] font-medium text-background shadow-md",
              "animate-in fade-in-0 zoom-in-95 slide-in-from-top-1",
            )}
          >
            <Check className="h-3 w-3" />
            已复制到剪贴板
          </div>
        )}
      </div>

      {/* 清空会话 */}
      <IconButton
        title="清空会话"
        onClick={handleClearClick}
        disabled={!hasMessages}
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </IconButton>

      {/* 清空确认弹窗 */}
      <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
        {/* 用一个不可见的 button 作为锚点定位 */}
        <PopoverTrigger
          render={
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="pointer-events-none absolute h-0 w-0 opacity-0"
            />
          }
        />
        <PopoverContent align="end" className="w-64 p-3">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">清空会话</p>
              <p className="mt-1 text-xs text-muted-foreground">
                清空后无法恢复,确定继续?
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmOpen(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleConfirmClear}
              >
                清空
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

interface IconButtonProps {
  title: string
  onClick?: () => void
  disabled?: boolean
  highlighted?: boolean
  children: React.ReactNode
}

function IconButton({
  title,
  onClick,
  disabled,
  highlighted,
  children,
}: IconButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "h-7 w-7",
        highlighted && "text-primary",
      )}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  )
}