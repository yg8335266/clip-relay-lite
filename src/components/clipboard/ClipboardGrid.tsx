"use client";

import React from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Share2, Trash2, FileText, Image as ImageIcon, File as FileIcon, QrCode } from "lucide-react";
import { authFetch } from "@/lib/auth";
import { safeCopyText, isSecure } from "@/lib/copy";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatFileSize } from "@/lib/format";

export type ClipboardItem = {
  id: string;
  type: "TEXT" | "IMAGE" | "FILE";
  content?: string;
  fileName?: string;
  fileSize?: number;
  sortWeight?: number;
  createdAt: string;
  updatedAt: string;
};

type GridProps = {
  items: ClipboardItem[];
  onReorder: (items: ClipboardItem[]) => void;
  onSelectItem: (id: string) => void;
  onCopy: (content: string) => void; // deprecated: copy share link instead
  onRequestDelete: (id: string) => void;
  onRequestShare: (id: string) => void;
  onRequestShowQr?: (id: string) => void;
};

function getTypeIcon(type: string) {
  switch (type) {
    case "TEXT":
      return <FileText className="h-4 w-4" />;
    case "IMAGE":
      return <ImageIcon className="h-4 w-4" />;
    case "FILE":
    default:
      return <FileIcon className="h-4 w-4" />;
  }
}

export default function ClipboardGrid({ items, onReorder, onSelectItem, onCopy, onRequestDelete, onRequestShare, onRequestShowQr }: GridProps) {
  const sensors = useSensors(
    // 使用移动距离阈值，避免按压延迟带来的点击迟滞感
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over) return;
    if (active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) {
        onReorder(arrayMove(items, oldIndex, newIndex));
      }
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <SortableItem
              key={item.id}
              id={item.id}
              item={item}
              onSelectItem={onSelectItem}
              onCopy={onCopy}
              onRequestDelete={onRequestDelete}
              onRequestShare={onRequestShare}
              onRequestShowQr={onRequestShowQr}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

type SortableItemProps = {
  id: string;
  item: ClipboardItem;
  onSelectItem: (id: string) => void;
  onCopy: (content: string) => void;
  onRequestDelete: (id: string) => void;
  onRequestShare: (id: string) => void;
  onRequestShowQr?: (id: string) => void;
};

const SortableItem = React.memo(function SortableItem({ id, item, onSelectItem, onCopy, onRequestDelete, onRequestShare, onRequestShowQr }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const { toast } = useToast();

  const [shareMeta, setShareMeta] = React.useState<null | { url: string; token: string; maxDownloads: number | null; downloadCount: number; expiresAt: string | null; requiresPassword: boolean }>(null);
  const [loadingShare, setLoadingShare] = React.useState(false);

  const loadShare = React.useCallback(async () => {
    try {
      setLoadingShare(true);
      const res = await authFetch(`/api/clipboard/${item.id}/share`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'failed');
      setShareMeta({ url: data.url, token: data.token, maxDownloads: (typeof data.maxDownloads === 'number' ? data.maxDownloads : null), downloadCount: Number(data.downloadCount || 0), expiresAt: data.expiresAt || null, requiresPassword: !!data.requiresPassword });
    } catch (e: any) {
      toast({ title: '分享信息获取失败', variant: 'destructive' });
    } finally {
      setLoadingShare(false);
    }
  }, [item.id, toast]);

  React.useEffect(() => { loadShare(); }, [loadShare]);

  const copyShareLink = async () => {
    try {
      // Always fetch latest share info to get current URL (in case it was reset)
      await loadShare();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const url = origin + (shareMeta?.url || '');
      const ok = await safeCopyText(url);
      if (ok) toast({ title: '已复制链接' }); else toast({ title: '请手动复制', description: isSecure() ? '浏览器限制或权限不足' : '当前为 HTTP 环境，系统复制受限', variant: 'destructive' });
    } catch {}
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  } as React.CSSProperties;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className="group relative hover:shadow-md transition-shadow cursor-pointer h-52"
        onClick={() => {
          if (!isDragging) onSelectItem(item.id);
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getTypeIcon(item.type)}
              <Badge variant="secondary">{item.type}</Badge>
            </div>
            <div className="flex gap-1 items-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer"
                onClick={(e) => { e.stopPropagation(); copyShareLink(); }}
                disabled={loadingShare}
              >
                <Copy className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestShare(item.id);
                }}
                aria-label="分享"
                title="分享"
              >
                <Share2 className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer"
                onClick={(e) => { e.stopPropagation(); if (onRequestShowQr) onRequestShowQr(item.id); }}
                aria-label="二维码"
                title="二维码"
              >
                <QrCode className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDelete(item.id);
                }}
                aria-label="删除"
                title="删除"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-12">
          <div className="space-y-2">
            {(item.type === "FILE" || item.type === "IMAGE") && (
              <p className="text-sm font-medium truncate">{item.fileName || (item.type === "IMAGE" ? "图片" : "文件")}</p>
            )}
            {item.content && <p className="text-sm text-muted-foreground line-clamp-3">{item.content}</p>}
          </div>
          <div className="absolute bottom-3 right-3 text-right text-xs text-muted-foreground">
            {typeof item.fileSize === "number" && item.fileSize > 0 && <div>大小: {formatFileSize(item.fileSize)}</div>}
            <div>{formatDate(item.createdAt)}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
