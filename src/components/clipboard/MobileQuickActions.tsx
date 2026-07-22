"use client";

import { useRef, useState, type ChangeEvent } from "react";
import axios from "axios";
import { Camera, Images, LoaderCircle, Type } from "lucide-react";

import AddItemDialog from "@/components/clipboard/AddItemDialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/auth";

type Props = {
  onItemAdded: () => void;
};

export default function MobileQuickActions({ onItemAdded }: Props) {
  const albumInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadLabel, setUploadLabel] = useState<string>("");
  const { toast } = useToast();

  const uploadFile = async (file: File, source: "相册" | "拍照") => {
    setUploadLabel(source);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append("content", "");
      formData.append("file", file);
      formData.append("type", file.type.startsWith("image/") ? "IMAGE" : "FILE");
      formData.append("shareExpiresIn", "0");

      await axios.post("/api/clipboard", formData, {
        headers: {
          ...(getAuthHeaders() as Record<string, string>),
          "Content-Type": "multipart/form-data",
        },
        withCredentials: true,
        onUploadProgress(progressEvent) {
          const progress = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setUploadProgress(progress);
        },
      });

      onItemAdded();
      toast({
        title: source === "拍照" ? "照片已上传" : "图片已上传",
        description: file.name || "已发送到剪贴板",
      });
    } catch (error: any) {
      toast({
        title: `${source}上传失败`,
        description: error?.message || "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setUploadProgress(null);
      setUploadLabel("");
    }
  };

  const handlePickedFile = async (
    event: ChangeEvent<HTMLInputElement>,
    source: "相册" | "拍照",
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await uploadFile(file, source);
  };

  const uploading = uploadProgress !== null;

  return (
    <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="mx-auto max-w-7xl rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="grid grid-cols-3 gap-2">
          <AddItemDialog
            onItemAdded={onItemAdded}
            dialogTitle="发送文本或文件"
            trigger={
              <Button variant="outline" className="h-12 w-full rounded-xl">
                <Type className="mr-2 h-4 w-4" /> 文本
              </Button>
            }
          />
          <Button
            variant="outline"
            className="h-12 rounded-xl"
            onClick={() => albumInputRef.current?.click()}
            disabled={uploading}
          >
            <Images className="mr-2 h-4 w-4" /> 相册
          </Button>
          <Button className="h-12 rounded-xl" onClick={() => cameraInputRef.current?.click()} disabled={uploading}>
            <Camera className="mr-2 h-4 w-4" /> 拍照
          </Button>
        </div>

        <input
          ref={albumInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handlePickedFile(event, "相册")}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => void handlePickedFile(event, "拍照")}
        />

        {uploading && (
          <div className="mt-3 space-y-2 rounded-xl bg-muted/60 px-3 py-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 font-medium">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {uploadLabel}上传中
              </div>
              <span className="text-muted-foreground">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress ?? 0} className="w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
