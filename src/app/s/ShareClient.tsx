"use client";

// Moved from app/s/[token]/ShareClient.tsx to support static export via query param (?token=...)
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy } from "lucide-react";
import { safeCopyText } from "@/lib/copy";
import { resolveApiUrl } from "@/lib/auth";

type ShareMeta = {
  token: string;
  item: {
    id: string;
    type: "TEXT" | "IMAGE" | "FILE";
    fileName?: string | null;
    fileSize?: number | null;
    contentType?: string | null;
    content?: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  expiresAt?: string | null;
  maxDownloads?: number | null;
  downloadCount: number;
  requiresPassword: boolean;
  authorized: boolean;
};

export default function ShareClient({ token }: { token: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<ShareMeta | null>(null);
  const [pwd, setPwd] = useState("");
  const [unlockedPassword, setUnlockedPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchMeta = async (sharePassword?: string) => {
    if (!token) return;
    try {
      setLoading(true);
      const headers: HeadersInit = {};
      const pass = sharePassword || unlockedPassword;
      if (pass) headers["X-Share-Password"] = pass;
      const res = await fetch(resolveApiUrl(`/api/share/${token}`), {
        credentials: "include",
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "failed");
      setMeta(data);
    } catch (e) {
      toast({ title: "链接不可用", description: "该分享已过期或被撤销", variant: "destructive" });
      setMeta(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const verify = async () => {
    try {
      setSubmitting(true);
      const res = await fetch(resolveApiUrl(`/api/share/${token}/verify`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "verify failed");
      setUnlockedPassword(pwd);
      setPwd("");
      await fetchMeta(pwd);
    } catch (e) {
      toast({ title: "口令错误", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <Card>
          <CardHeader>
            <div className="text-xl font-semibold">分享无效</div>
          </CardHeader>
          <CardContent>缺少 token 参数。</CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <Card>
          <CardHeader>
            <div className="text-xl font-semibold">分享不可用</div>
          </CardHeader>
          <CardContent>该分享可能已过期、达到下载上限或被撤销。</CardContent>
        </Card>
      </div>
    );
  }

  if (meta.requiresPassword && !meta.authorized) {
    return (
      <div className="max-w-md mx-auto p-6">
        <Card>
          <CardHeader>
            <div className="text-xl font-semibold">需要口令</div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="password"
              placeholder="请输入分享口令"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
            />
            <Button onClick={verify} disabled={submitting || !pwd}>
              {submitting ? "验证中..." : "解锁"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const item = meta.item;
  if (!item) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <Card>
          <CardHeader>
            <div className="text-xl font-semibold">内容不存在</div>
          </CardHeader>
          <CardContent>分享对应的内容已被删除。</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">分享内容</div>
        </CardHeader>
        <CardContent className="space-y-4">
          {item.type === "TEXT" && (
            <div className="space-y-2">
              <pre className="whitespace-pre-wrap break-words rounded bg-muted p-3 text-sm">
                {item.content || ""}
              </pre>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    const ok = await safeCopyText(item.content || "");
                    toast({
                      title: ok ? "已复制" : "复制失败",
                      variant: ok ? "default" : "destructive",
                    });
                  }}
                >
                  <Copy className="h-4 w-4 mr-1" /> 复制文本
                </Button>
                <a className="underline text-sm self-center" href={resolveApiUrl(`/api/share/${token}/download`)}>
                  下载为文本文件
                </a>
              </div>
            </div>
          )}

          {item.type === "IMAGE" && (
            <div className="space-y-2">
              <img
                src={resolveApiUrl(`/api/share/${token}/file`)}
                alt={item.fileName || "image"}
                className="max-w-full rounded border"
              />
              <a className="underline" href={resolveApiUrl(`/api/share/${token}/download`)}>
                下载图片
              </a>
            </div>
          )}

          {item.type === "FILE" && (
            <div className="space-y-2">
              <div className="text-sm">
                文件：{item.fileName || "file"} {item.fileSize ? `(${item.fileSize} bytes)` : ""}
              </div>
              <a className="underline" href={resolveApiUrl(`/api/share/${token}/download`)}>
                下载文件
              </a>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            {meta.expiresAt && <div>过期时间：{new Date(meta.expiresAt).toLocaleString()}</div>}
            {meta.maxDownloads != null && (
              <div>
                下载次数：{meta.downloadCount}/{meta.maxDownloads}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
