import React, { useMemo, useState } from "react";
import { AVA_IMAGES, getAvatarUrlByFileName } from "./PlayerPositions";
import { AvifIcon } from "./AvifIcon";
import ConfirmModal from "./ConfirmModal";
import { socket } from "../socket";
import TrashIcon from "../assets/trash-x.svg";

interface AvatarSelectModalProps {
  open: boolean;
  onClose: () => void;
  myAvatar: string;
  clientId: string;
  onSelect: (fileName: string) => void;
  onClear: () => void;
}

export const AvatarSelectModal: React.FC<AvatarSelectModalProps> = ({
  open,
  onClose,
  myAvatar,
  clientId,
  onSelect,
  onClear,
}) => {
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);
  const [locallyDeletedFiles, setLocallyDeletedFiles] = useState<string[]>([]);

  const myAvatars = useMemo(() => {
    return Object.keys(AVA_IMAGES)
      .map((path) => path.split("/").pop() || "")
      .filter((fileName) => {
        const lower = fileName.toLowerCase();
        return (
          lower.includes(clientId.toLowerCase()) && 
          !lower.includes("deleted") && 
          !locallyDeletedFiles.includes(fileName)
        );
      })
      .sort();
  }, [clientId, locallyDeletedFiles]);

  const handleConfirmDelete = () => {
    if (!deletingFileName) return;
    
    // Gửi sự kiện xóa lên server qua socket
    socket.emit("deleteAvatar", { fileName: deletingFileName });
    
    // Thêm vào danh sách tạm ẩn ở client
    setLocallyDeletedFiles(prev => [...prev, deletingFileName]);
    
    // Nếu avatar đang chọn chính là avatar bị xóa, gọi onClear để gỡ avatar hiện tại
    if (myAvatar === deletingFileName) {
      onClear();
    }
    
    setDeletingFileName(null);
  };

  if (!open) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(4, 6, 15, 0.8)",
          backdropFilter: "blur(12px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9,
          padding: 16,
        }}
      >
        <div
          className="lobby-card"
          style={{
            width: "100%",
            maxWidth: 480,
            maxHeight: "85vh",
            overflowY: "auto",
            position: "relative",
            animation: "modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#ff8f42" }}>
              Chọn Avatar
            </h2>
            <div
              onClick={onClose}
              style={{
                border: "none",
                background: "rgba(255, 255, 255, 0.05)",
                color: "#fff",
                width: 32,
                height: 32,
                borderRadius: "50%",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
              }}
            >
              ✕
            </div>
          </div>

          {myAvatars.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px 16px",
                background: "rgba(255, 255, 255, 0.02)",
                borderRadius: 16,
                border: "1px dashed rgba(255, 255, 255, 0.1)",
                color: "rgba(255,255,255,0.4)",
                fontSize: 12,
              }}
            >
              <AvifIcon
                name="🔒"
                style={{
                  width: 37,
                  height: 37,
                  display: "block",
                  margin: "0 auto 8px",
                  opacity: 0.4,
                }}
              />
              Bạn chưa được gán Avatar VIP nào trên hệ thống
              <br />
              Hãy liên hệ Quản Trò để biết thêm chi tiết
            </div>
          ) : (
            <>
              <p
                style={{
                  margin: "0 0 16px 0",
                  fontSize: 14,
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                Dưới đây là các avatar VIP đã có của bạn
              </p>
              <div id="ava-vip-list"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 16,
                  padding: 4,
                }}
              >
                {myAvatars.map((fileName) => {
                  const url = getAvatarUrlByFileName(fileName);
                  const isSelected = myAvatar === fileName;
                  const isMFormat = fileName.includes("M-");
                  let numberDisplay = "VIP";
                  if (isMFormat && fileName.split(" ")[1]) {
                    numberDisplay = `VIP #${fileName.split(" ")[1].split(".")[0].substring(2)}`;
                  }
                  return (
                    <div key={fileName} style={{ position: "relative" }}>
                      <div
                        onClick={() => onSelect(fileName)}
                        style={{
                          aspectRatio: "1/1",
                          borderRadius: 16,
                          background: url ? `url("${url}")` : "rgba(255,255,255,0.05)",
                          backgroundPosition: "center",
                          backgroundSize: "cover",
                          backgroundRepeat: "no-repeat",
                          cursor: "pointer",
                          border: isSelected
                            ? "3px solid #ff8f42"
                            : "2px solid rgba(255,255,255,0.1)",
                          boxShadow: isSelected
                            ? "0 0 16px rgba(255, 143, 66, 0.4)"
                            : "none",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            right: 0,
                            padding: "4px 8px",
                            background: "rgba(0,0,0,0.6)",
                            backdropFilter: "blur(4px)",
                            borderBottomLeftRadius: 12,
                            borderBottomRightRadius: 12,
                            fontSize: 11,
                            textAlign: "center",
                            color: isSelected ? "#ff8f42" : "#fff",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {numberDisplay}
                        </div>
                      </div>

                      {/* Nút xóa hình rác ở góc trên bên phải */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingFileName(fileName);
                        }}
                        style={{
                          position: "absolute",
                          top: -6,
                          right: -6,
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: "rgba(231, 76, 60, 0.9)",
                          border: "1.5px solid rgba(255, 255, 255, 0.8)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                          transition: "all 0.2s ease",
                          zIndex: 10
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#e74c3c";
                          e.currentTarget.style.transform = "scale(1.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(231, 76, 60, 0.9)";
                          e.currentTarget.style.transform = "scale(1)";
                        }}
                        title="Xóa avatar này"
                      >
                        <img src={TrashIcon} alt="Xóa" style={{ width: 12, height: 12 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {myAvatar && (
            <button
              onClick={onClear}
              style={{
                marginTop: 16,
                width: "100%",
                padding: "12px 20px",
                borderRadius: 12,
                border: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(255, 255, 255, 0.05)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 700,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.09)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
              }}
            >
              Gỡ Avatar hiện tại
            </button>
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!deletingFileName}
        title="Xác nhận xóa Avatar"
        message="Bạn có chắc chắn muốn xóa avatar VIP này không?"
        confirmText="Xóa"
        cancelText="Hủy"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingFileName(null)}
      />
    </>
  );
};
