import { Plus } from "lucide-react"
import { v4 as uuid } from "uuid"

import { Button } from "@/components/ui/button"

import { MarkdownBlock } from "./markdown-block"
import { createEmptyBlock } from "./serializer"
import type { TemplateBlock } from "./types"

interface BlockListProps {
  blocks: TemplateBlock[]
  onChange: (blocks: TemplateBlock[]) => void
}

export function BlockList({ blocks, onChange }: BlockListProps) {
  const updateBlock = (id: string, content: string) => {
    onChange(blocks.map((b) => (b.id === id ? { ...b, content } : b)))
  }

  const removeBlock = (id: string) => {
    if (blocks.length === 1) return
    onChange(blocks.filter((b) => b.id !== id))
  }

  const moveBlock = (id: string, dir: -1 | 1) => {
    const idx = blocks.findIndex((b) => b.id === id)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= blocks.length) return
    const next = blocks.slice()
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  const duplicateBlock = (id: string) => {
    const idx = blocks.findIndex((b) => b.id === id)
    if (idx < 0) return
    const copy: TemplateBlock = { ...blocks[idx], id: uuid() }
    const next = blocks.slice()
    next.splice(idx + 1, 0, copy)
    onChange(next)
  }

  const addBlock = () => {
    onChange([...blocks, createEmptyBlock()])
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => (
        <MarkdownBlock
          key={b.id}
          block={b}
          index={i}
          total={blocks.length}
          onChange={updateBlock}
          onRemove={removeBlock}
          onMove={moveBlock}
          onDuplicate={duplicateBlock}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addBlock}
        className="self-start border-dashed"
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        添加 Markdown 块
      </Button>
    </div>
  )
}