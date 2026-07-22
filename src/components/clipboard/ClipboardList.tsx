"use client";

import React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Share2,
  Trash2,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  QrCode,
} from "lucide-react";
import { formatDate, formatFileSize } from "@/lib/format";
import { authFetch } from "@/lib/auth";
import { safeCopyText, isSecure } from "@/lib/copy";
import { useToast } from "@/hooks/use-toast";
import type { ClipboardItem as GridItem } from "@/components/clipboard/ClipboardGrid";

export type ClipboardItem = GridItem;

type ListProps = {
  items: ClipboardItem[];
  onReorder: (items: ClipboardItem[]) => void;
  onSelectItem: (id: string) => void;
  onCopy: (content: string) => void;
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

export default function ClipboardList({
  items,
  onReorder,
  onSelectItem,
  onCopy,
  onRequestDelete,
  onRequestShare,
  onRequestShowQr,
}: ListProps) {
  const sensors = useSensors(
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
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader className="hidden md:table-header-group">
              <TableRow>
                <TableHead className="w-[50%] min-w-[280px]">条目</TableHead>
                <TableHead className="w-[15%]">大小</TableHead>
                <TableHead className="w-[25%]">创建时间</TableHead>
                <TableHead className="w-[10%] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <SortableRow
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
            </TableBody>
          </Table>
        </div>
      </SortableContext>
    </DndContext>
  );
}

type RowProps = {
  id: string;
  item: ClipboardItem;
  onSelectItem: (id: string) => void;
  onCopy: (content: string) => void;
  onRequestDelete: (id: string) => void;
  onRequestShare: (id: string) => void;
  onRequestShowQr?: (id: string) => void;
};

const SortableRow = React.memo(function SortableRow({
  id,
  item,
  onSelectItem,
  onCopy,
  onRequestDelete,
  onRequestShare,
  onRequestShowQr,
}: RowProps) {
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
    opacity: isDragging ? 0.6 : 1,
  } as React.CSSProperties;

  const primaryText = (() => {
    if (item.type === "FILE" || item.type === "IMAGE") {
      return item.fileName || (item.type === "IMAGE" ? "图片" : "文件");
    }
    if (item.content) {
      const firstLine = item.content.split("\n")[0];
      return firstLine.trim() || "文本";
    }
    return "条目";
  })();
  const isText = item.type === "TEXT";

  return (
    <tr
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="hover:bg-muted/50 border-b transition-colors cursor-pointer"
      onClick={() => {
        if (!isDragging) onSelectItem(item.id);
      }}
    >
      {/* Desktop: traditional table layout */}
      <TableCell className="hidden md:table-cell">
        <div className="flex items-center gap-3">
          {getTypeIcon(item.type)}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className={"truncate max-w-full " + (isText ? "text-sm" : "font-medium")}>{primaryText}</span>
              <Badge variant="secondary">{item.type}</Badge>
            </div>
            {!isText && item.content && (
              <p className="text-xs text-muted-foreground truncate max-w-full min-w-0 mt-1 break-all">
                {item.content}
              </p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {typeof item.fileSize === "number" && item.fileSize > 0
          ? formatFileSize(item.fileSize)
          : "-"}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <div>{formatDate(item.createdAt)}</div>
        {shareMeta && (
          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            <div>访问：{shareMeta.downloadCount}/{typeof shareMeta.maxDownloads === 'number' ? shareMeta.maxDownloads : '不限'}</div>
            <div>有效期：{shareMeta.expiresAt ? new Date(shareMeta.expiresAt).toLocaleString('zh-CN') : '永不过期'}</div>
            <div>口令：{shareMeta.requiresPassword ? '已设置' : '无'}</div>
          </div>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell text-right">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="cursor-pointer"
            onClick={(e) => { e.stopPropagation(); copyShareLink(); }}
            disabled={loadingShare}
            aria-label="复制"
            title="复制"
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
            onClick={(e) => { e.stopPropagation(); if (onRequestShowQr) onRequestShowQr(item.id); else onRequestShare(item.id); }}
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
      </TableCell>

      {/* Mobile: card-like layout in single cell */}
      <TableCell className="md:hidden" colSpan={4}>
        <div className="flex flex-col gap-3 py-2">
          {/* Header: icon, title, type badge */}
          <div className="flex items-start gap-3">
            <div className="mt-0.5">{getTypeIcon(item.type)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={"font-medium " + (isText ? "text-sm" : "")}>{primaryText}</span>
                <Badge variant="secondary" className="text-xs">{item.type}</Badge>
              </div>
              {!isText && item.content && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {item.content}
                </p>
              )}
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <div>{formatDate(item.createdAt)}</div>
            {typeof item.fileSize === "number" && item.fileSize > 0 && (
              <div>{formatFileSize(item.fileSize)}</div>
            )}
          </div>

          {/* Share info (if available) */}
          {shareMeta && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <div>访问：{shareMeta.downloadCount}/{typeof shareMeta.maxDownloads === 'number' ? shareMeta.maxDownloads : '不限'}</div>
              <div>有效期：{shareMeta.expiresAt ? new Date(shareMeta.expiresAt).toLocaleDateString('zh-CN') : '永不'}</div>
              {shareMeta.requiresPassword && <div>🔒 已加密</div>}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="cursor-pointer"
              onClick={(e) => { e.stopPropagation(); copyShareLink(); }}
              disabled={loadingShare}
              aria-label="复制"
              title="复制"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onRequestShare(item.id); }}
              aria-label="分享"
              title="分享"
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="cursor-pointer"
              onClick={(e) => { e.stopPropagation(); if (onRequestShowQr) onRequestShowQr(item.id); else onRequestShare(item.id); }}
              aria-label="二维码"
              title="二维码"
            >
              <QrCode className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onRequestDelete(item.id); }}
              aria-label="删除"
              title="删除"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </TableCell>
    </tr>
  );
});
