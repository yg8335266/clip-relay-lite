"use client";

import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { safeCopyText, safeCopyBlob } from "@/lib/copy";
import { authFetch, resolveApiUrl } from "@/lib/auth";
import { File as FileIcon, FileText, Image as ImageIcon, Copy } from "lucide-react";
import { formatFileSize } from "@/lib/format";

type ClipboardItem = {
  id: string;
  type: "TEXT" | "IMAGE" | "FILE";
  content?: string;
  fileName?: string;
  fileSize?: number;
  createdAt: string;
  updatedAt: string;
};

export default function ItemDetailDialog({
  item,
  open,
  onOpenChange,
  onDelete,
}: {
  item: ClipboardItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const { toast } = useToast();
  const [imgBlob, setImgBlob] = useState<Blob | null>(null);
  const [imgMime, setImgMime] = useState<string | null>(null);

  // Prefetch image blob when dialog opens to speed up copy
  useEffect(() => {
    let aborted = false;
    setImgBlob(null);
    setImgMime(null);
    if (open && item?.type === 'IMAGE') {
      (async () => {
        try {
          const res = await authFetch(`/api/files/${item.id}`, { cache: 'force-cache' });
          if (!res.ok) return;
          const type = res.headers.get('content-type') || 'image/png';
          const blob = await res.blob();
          if (!aborted) { setImgMime(type); setImgBlob(blob); }
        } catch {}
      })();
    }
    return () => { aborted = true; };
  }, [open, item?.id, item?.type]);


  if (!item) return null;

  const copyToClipboard = async (content: string) => {
    const ok = await safeCopyText(content);
    if (ok) {
      toast({ title: "已复制到剪贴板", description: "内容已成功复制到剪贴板" });
    } else {
      toast({ title: "复制失败", description: "浏览器限制或权限不足，请手动复制", variant: "destructive" });
    }
  };

  const copyImage = async () => {
    try {
      let blob = imgBlob; let type = imgMime || undefined;
      if (!blob) {
        const res = await authFetch(`/api/files/${item.id}`, { cache: 'force-cache' });
        if (!res.ok) throw new Error('fetch failed');
        type = res.headers.get('content-type') || 'image/png';
        blob = await res.blob();
      }
      const ok = blob ? await safeCopyBlob(blob, type) : false;
      if (ok) {
        toast({ title: "已复制图片" });
      } else {
        toast({ title: "无法复制图片", description: "当前使用非安全连接（HTTP），浏览器不支持图片复制。请在 HTTPS 环境下尝试。", variant: "destructive" });
      }
    } catch {
      toast({ title: "无法复制图片", description: "请长按图片复制，或使用下载按钮", variant: "destructive" });
    }
  };

  const downloadFile = () => {
    const link = document.createElement("a");
    link.href = resolveApiUrl(`/api/files/${item.id}?download=1`);
    link.download = item.fileName || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "TEXT":
        return <FileText className="h-5 w-5" />;
      case "IMAGE":
        return <ImageIcon className="h-5 w-5" />;
      case "FILE":
      default:
        return <FileIcon className="h-5 w-5" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto custom-scrollbar w-[calc(100vw-2rem)] sm:w-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {getTypeIcon(item.type)}
            <div>
              <DialogTitle className="text-xl">条目详情</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{item.type}</Badge>
                {typeof item.fileSize === "number" && (
                  <span className="text-sm text-muted-foreground">{formatFileSize(item.fileSize)}</span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {item.content && (
            <div>
              <h3 className="text-sm font-medium mb-2">内容</h3>
              <div className="relative bg-muted p-4 rounded-lg group">
                {item.type === "TEXT" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(item.content!)}
                    className="absolute top-2 right-2 h-8 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    title="复制内容"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
                <pre className="whitespace-pre-wrap break-words text-sm pr-12">{item.content}</pre>
              </div>
            </div>
          )}

          {item.type === "IMAGE" && (
            <div>
              <h3 className="text-sm font-medium mb-2">图片预览</h3>
              <div className="bg-muted p-4 rounded-lg flex justify-center min-h-[24rem]">
                <img
                  src={resolveApiUrl(`/api/files/${item.id}`)}
                  alt={item.fileName || "图片"}
                  className="max-w-full max-h-96 object-contain rounded"
                  loading="eager"
                  decoding="async"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={copyImage}>
                  <Copy className="h-4 w-4 mr-2" /> 复制图片
                </Button>
                <Button variant="outline" size="sm" onClick={downloadFile}>
                  下载图片
                </Button>
              </div>
            </div>
          )}

          {item.type === "FILE" && (
            <div>
              <h3 className="text-sm font-medium mb-2">文件信息</h3>
              <div className="bg-muted p-4 rounded-lg">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">文件名:</span>
                    <span className="text-sm">{item.fileName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">大小:</span>
                    <span className="text-sm">{formatFileSize(item.fileSize || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">类型:</span>
                    <span className="text-sm">{item.type}</span>
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-2" onClick={downloadFile}>
                <Copy className="h-4 w-4 mr-2" /> 下载文件
              </Button>
            </div>
          )}

          {/* 分享功能已迁移到条目外的分享图标和全局对话框，这里不再展示 */}

          <div>
            <h3 className="text-sm font-medium mb-2">元数据</h3>
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">创建时间:</span>
                <span className="text-sm">{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
              </div>
              {item.updatedAt !== item.createdAt && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">更新时间:</span>
                  <span className="text-sm">{new Date(item.updatedAt).toLocaleString("zh-CN")}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm font-medium">ID:</span>
                <span className="text-sm font-mono">{item.id}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  删除
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认删除</AlertDialogTitle>
                  <AlertDialogDescription>删除后将无法恢复。确定要删除该条目吗？</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(item.id)}>确认删除</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
