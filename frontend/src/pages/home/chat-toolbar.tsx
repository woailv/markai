import { Copy, History, MoreHorizontal, Trash2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import type { ChatMessage } from "./types"

interface ChatToolbarProps {
  messages: ChatMessage[]
  onClear: () => void
  onOpenHistory?: () => void
}

/**
 * 会话工具条:历史 / 复制全部 / 更多(清空)
 * - 复制/清空 在无消息时禁用
 * - 清空需二次确认,防止误操作
 */
export function ChatToolbar({
  messages,
  onClear,
  onOpenHistory,
}: ChatToolbarProps) {
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const hasMessages = messages.length > 0

  const handleCopyAll = async () => {
    if (!hasMessages) return
    const text = messages
      .map(
        (m) =>
          `**${m.role === "user" ? "我" : "助手"}**:\n${m.content}`,
      )
      .join("\n\n---\n\n")
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error("复制失败:", err)
      throw err
    }
  }

  const handleClearClick = () => {
    setMenuOpen(false)
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

      {/* 历史会话 */}
      <IconButton
        title="历史会话"
        onClick={onOpenHistory}
        disabled={!onOpenHistory}
      >
        <History className="h-3.5 w-3.5" />
      </IconButton>

      {/* 复制全部 */}
      <IconButton
        title={copied ? "已复制" : "复制全部"}
        onClick={handleCopyAll}
        disabled={!hasMessages}
        highlighted={copied}
      >
        <Copy className="h-3.5 w-3.5" />
      </IconButton>

      {/* 更多菜单 */}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="更多"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-40 p-1">
          <button
            type="button"
            onClick={handleClearClick}
            disabled={!hasMessages}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
              "text-destructive hover:bg-destructive/10",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空会话
          </button>
        </PopoverContent>
      </Popover>

      {/* 清空确认弹窗 */}
      <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
        {/* 用一个不可见的 trigger 定位在右上角 */}
        <PopoverTrigger
          render={
            <span className="pointer-events-none absolute" aria-hidden />
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