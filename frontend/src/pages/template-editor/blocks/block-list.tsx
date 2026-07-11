import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { Plus } from "lucide-react"
import { v4 as uuid } from "uuid"

import { Button } from "@/components/ui/button"

import { SortableMarkdownBlock } from "./markdown-block"
import { createEmptyBlock } from "./serializer"
import type { TemplateBlock } from "./types"

interface BlockListProps {
  blocks: TemplateBlock[]
  onChange: (blocks: TemplateBlock[]) => void
}

export function BlockList({ blocks, onChange }: BlockListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const updateBlock = (id: string, content: string) => {
    onChange(blocks.map((b) => (b.id === id ? { ...b, content } : b)))
  }

  const removeBlock = (id: string) => {
    if (blocks.length === 1) return
    onChange(blocks.filter((b) => b.id !== id))
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = blocks.findIndex((b) => b.id === active.id)
    const newIndex = blocks.findIndex((b) => b.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onChange(arrayMove(blocks, oldIndex, newIndex))
  }

  return (
    <div className="flex flex-col gap-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      >
        <SortableContext
          items={blocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {blocks.map((b, i) => (
            <SortableMarkdownBlock
              key={b.id}
              block={b}
              index={i}
              total={blocks.length}
              onChange={updateBlock}
              onRemove={removeBlock}
              onDuplicate={duplicateBlock}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addBlock}
        className="self-start border-dashed"
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        添加内容块
      </Button>
    </div>
  )
}