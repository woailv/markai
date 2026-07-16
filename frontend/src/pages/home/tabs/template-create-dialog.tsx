import { useEffect, useRef, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import {Input} from "@/components/ui/input.tsx";

/**
 * 类似 IDEA "New File" 弹框:仅收集模板标题。
 *
 * 使用命令式 API `openCreateTemplateDialog()`,resolves 为用户输入的标题
 * (已 trim)或 null(取消)。
 *
 * 组件通过 `<CreateTemplateDialogHost />` 挂到主页布局中一次即可,
 * 与 close-confirm-dialog 的用法保持一致。
 */

type Resolver = (title: string | null) => void

let mount: ((r: Resolver) => void) | null = null

export function openCreateTemplateDialog(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!mount) {
      // Host 未挂载时兜底为 window.prompt,避免功能不可用
      const v = window.prompt("请输入模板名称")
      resolve(v && v.trim() ? v.trim() : null)
      return
    }
    mount(resolve)
  })
}

export function CreateTemplateDialogHost() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  // 用 ref 保存 resolver,避免受 React 状态更新时序影响:
  // Radix 的 AlertDialogAction 在自身 onClick 中会调用 onOpenChange(false),
  // 若用 state 保存 resolver,可能出现 onOpenChange 先以 null resolve、
  // 之后自定义 onClick 再也拿不到 resolver 的竞态问题。
  const resolverRef = useRef<Resolver | null>(null)

  useEffect(() => {
    mount = (r) => {
      resolverRef.current = r
      setTitle("")
      setOpen(true)
    }
    return () => {
      mount = null
    }
  }, [])

  const finish = (val: string | null) => {
    const r = resolverRef.current
    resolverRef.current = null
    r?.(val)
    setOpen(false)
  }

  const trimmed = title.trim()
  const canSubmit = trimmed.length > 0

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) finish(null)
      }}
    >
      <AlertDialogContent size="default" className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>新建模板</AlertDialogTitle>
          <AlertDialogDescription>
            为模板输入一个名称,创建后可继续编辑内容。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          {/*
            使用原生 input + 项目通用 tw 类,避免为一个字段引入 Input 组件依赖。
            autoFocus 让弹框打开后立即可键入,Enter 提交,Esc 由 AlertDialog 关闭。
          */}
          <label
            htmlFor="new-template-title"
            className="text-xs font-medium text-muted-foreground"
          >
            名称
          </label>
          <Input
            id="new-template-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) {
                e.preventDefault()
                finish(trimmed)
              }
            }}
            placeholder="例如:代码 Review 提示词"
            className={cn(
              "h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none",
              "focus:border-ring focus:ring-2 focus:ring-ring/50",
            )}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(null)}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canSubmit}
            onClick={() => finish(canSubmit ? trimmed : null)}
          >
            创建
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}