"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Share2, Smartphone, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "clip_relay_mobile_onboarding_dismissed";

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(media || iosStandalone);
}

export default function MobileOnboardingCard() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isTouchLike, setIsTouchLike] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    setIsStandalone(isStandaloneMode());
    setIsTouchLike(window.matchMedia?.("(pointer: coarse)")?.matches ?? /Android|iPhone|iPad/i.test(window.navigator.userAgent));

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstallEvent(null);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const canShow = useMemo(() => isTouchLike && !dismissed && !isStandalone, [dismissed, isStandalone, isTouchLike]);

  if (!canShow) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    try {
      await installEvent.userChoice;
    } finally {
      setInstallEvent(null);
    }
  };

  return (
    <Card className="mb-4 border-dashed border-primary/40 bg-primary/5 sm:mb-6">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Smartphone className="h-4 w-4" />
            手机更顺手的用法
          </div>
          <p className="text-sm text-muted-foreground">
            安装到主屏幕后，Android/Chromium 浏览器通常可以直接从系统分享面板把图片或文本发到 Clip Relay。
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={dismiss} aria-label="关闭提示">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <div className="rounded-lg bg-background/80 px-3 py-2">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Share2 className="h-4 w-4" />
            推荐流程
          </div>
          <p className="mt-1">
            先安装到主屏幕，再从相册或浏览器里点“分享”，选择 Clip Relay；如果系统里还没出现入口，先继续用底部“相册/拍照”快捷栏，并尝试删除旧快捷方式后重新安装。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {installEvent ? (
            <Button size="sm" onClick={() => void install()}>
              <Download className="mr-2 h-4 w-4" /> 安装到主屏幕
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              <Download className="mr-2 h-4 w-4" /> 浏览器暂未给出安装入口
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={dismiss}>
            知道了
          </Button>
        </div>
        {!installEvent && (
          <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            当前浏览器还没有触发安装事件。请优先用 Android 上的 Chrome、Edge 或 Samsung Internet 直接打开本站，并确认是 HTTPS 页面，不要在微信、QQ 等内置浏览器里打开。
          </div>
        )}
        <p className="text-xs">
          说明：Android 里也只有部分浏览器会把已安装的 PWA 放进系统分享面板；如果你刚更新过站点，通常需要删掉旧主屏幕图标再重装一次。iPhone Safari 对网页系统分享的支持则更有限，所以后面仍然需要继续补移动壳。
        </p>
      </CardContent>
    </Card>
  );
}
