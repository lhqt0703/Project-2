export default function ConfirmModal({
  open,
  title,
  message,
  infoOnly = false,
  closeText = "Đóng",
  confirmText = "Xác nhận",
  cancelText = "Huỷ",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  infoOnly?: boolean;
  closeText?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: "rgb(23 26 33 / 80%)",
          backdropFilter: "blur(12px)",
          padding: 32,
          borderRadius: 12,
          minWidth: 320,
          maxWidth: "min(92vw, 760px)",
          maxHeight: "82vh",
          overflowY: "auto",
          boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
        }}
      >
        <h2>{title}</h2>
        <p style={{ whiteSpace: "pre-line", lineHeight: 1.55 }}>{message}</p>
        <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
          {infoOnly ? (
            <button onClick={onConfirm}>{closeText}</button>
          ) : (
            <>
              <button onClick={onConfirm}>{confirmText}</button>
              <button onClick={onCancel}>{cancelText}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
