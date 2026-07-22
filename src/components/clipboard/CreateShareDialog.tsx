"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth";
import { safeCopyText, isSecure } from "@/lib/copy";

export default function CreateShareDialog({
  itemId,
  open,
  onOpenChange,
  ensureItemId,
  onFinished,
  initialShare,
  initialTab,
}: {
  itemId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ensureItemId?: () => Promise<string>;
  onFinished?: () => void;
  initialShare?: { token: string; url: string } | null;
  initialTab?: 'status' | 'settings';
}) {
  const { toast } = useToast();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [sharePassword, setSharePassword] = useState<string>("");
  // manage mode fields (when itemId provided)
  const [manageExpiresIn, setManageExpiresIn] = useState<string>("0");
  const [manageMaxDownloads, setManageMaxDownloads] = useState<string>("");
  // status meta
  const [downloadCount, setDownloadCount] = useState<number>(0);
  const [maxDownloads, setMaxDownloads] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [passwordPlain, setPasswordPlain] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => { /* initialTab ignored in settings-only mode */ }, [open, initialTab]);

  useEffect(() => {
    if (!open) {
      setShareUrl(null);
      setShareToken(null);
      setSharePassword("");
      return;
    }
    // If preset share provided, show result directly
    if (open && initialShare && !shareUrl && !shareToken) {
      setShareToken(initialShare.token);
      setShareUrl(initialShare.url);
    }
    // Manage existing item's share: fetch and show directly
    fetchShare();
  }, [open, initialShare, itemId, shareUrl, shareToken]);

  useEffect(() => {
    if (!open || !autoRefresh) return;
    const t = setInterval(() => { fetchShare(); }, 5000);
    return () => clearInterval(t);
  }, [open, autoRefresh, itemId]);

  const fetchShare = async () => {
    if (!itemId) return;
    try {
      const res = await authFetch(`/api/clipboard/${itemId}/share`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'failed');
      setShareToken(data.token);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setShareUrl(origin + data.url);
      setManageExpiresIn('0');
      setManageMaxDownloads(typeof data.maxDownloads === 'number' ? String(data.maxDownloads) : '');
      setDownloadCount(Number(data.downloadCount || 0));
      setMaxDownloads(typeof data.maxDownloads === 'number' ? data.maxDownloads : null);
      setExpiresAt(data.expiresAt || null);
      setPasswordPlain(data.password || null);
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>分享链接</DialogTitle>
        </DialogHeader>
        {!shareToken ? (
          <div className="py-6 text-center text-sm text-muted-foreground">加载中...</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-muted rounded p-2">已访问：{downloadCount}</div>
              <div className="bg-muted rounded p-2">可访问：{typeof maxDownloads === 'number' ? maxDownloads : '不限'}</div>
              <div className="bg-muted rounded p-2">剩余：{typeof maxDownloads === 'number' ? Math.max(0, (maxDownloads || 0) - (downloadCount || 0)) : '-'}</div>
              <div className="bg-muted rounded p-2">有效期：{expiresAt ? new Date(expiresAt).toLocaleString('zh-CN') : '永不过期'}</div>
              <div className="bg-muted rounded p-2 col-span-2">口令：{passwordPlain ? (<span className="font-mono">{passwordPlain}</span>) : '未设置'}</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">有效期</label>
                <select className="w-full rounded border px-2 py-1 text-sm bg-background" value={manageExpiresIn} onChange={(e) => setManageExpiresIn(e.target.value)}>
                  <option value="0">永不过期</option>
                  <option value="3600">1 小时</option>
                  <option value="86400">24 小时</option>
                  <option value="604800">7 天</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">可访问次数</label>
                <Input type="number" placeholder="可选" value={manageMaxDownloads} onChange={(e) => setManageMaxDownloads(e.target.value)} min={1} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">分享口令</label>
                <Input type="text" placeholder="可选" value={sharePassword} onChange={(e) => setSharePassword(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-between items-center">
                <Button variant="outline" onClick={async () => {
                  try {
                    const payload: any = { reset: true };
                    if (sharePassword.trim()) payload.password = sharePassword.trim();
                    const res = await authFetch(`/api/clipboard/${itemId}/share`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data?.error || 'reset failed');
                    setShareToken(data.token);
                    const origin = typeof window !== 'undefined' ? window.location.origin : '';
                    setShareUrl(origin + data.url);
                    setManageMaxDownloads(typeof data.maxDownloads === 'number' ? String(data.maxDownloads) : '');
                    setDownloadCount(Number(data.downloadCount || 0));
                    setMaxDownloads(typeof data.maxDownloads === 'number' ? data.maxDownloads : null);
                    setExpiresAt(data.expiresAt || null);
                    setPasswordPlain(data.password || null);
                    toast({ title: '已重置链接' });
                  } catch (e:any) { toast({ title: '重置失败', description: e?.message || '请稍后重试', variant: 'destructive' }); }
                }}>重置链接</Button>
                <Button onClick={async () => {
                  try {
                    const payload: any = {};
                    const ei = parseInt(manageExpiresIn, 10);
                    if (!isNaN(ei)) payload.expiresIn = ei;
                    if (manageMaxDownloads.trim()) payload.maxDownloads = Number(manageMaxDownloads);
                    if (sharePassword.trim()) payload.password = sharePassword.trim();
                    const res = await authFetch(`/api/clipboard/${itemId}/share`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data?.error || 'update failed');
                    setShareToken(data.token);
                    const origin = typeof window !== 'undefined' ? window.location.origin : '';
                    setShareUrl(origin + data.url);
                    setManageMaxDownloads(typeof data.maxDownloads === 'number' ? String(data.maxDownloads) : '');
                    setDownloadCount(Number(data.downloadCount || 0));
                    setMaxDownloads(typeof data.maxDownloads === 'number' ? data.maxDownloads : null);
                    setExpiresAt(data.expiresAt || null);
                    setPasswordPlain(data.password || null);
                    toast({ title: '已保存并关闭' });
                    onFinished?.();
                    onOpenChange(false);
                  } catch (e:any) { toast({ title: '保存失败', description: e?.message || '请稍后重试', variant: 'destructive' }); }
                }}>保存并关闭</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
