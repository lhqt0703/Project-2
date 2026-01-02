export default function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Xác nhận",
  cancelText = "Huỷ",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
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
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          padding: 32,
          borderRadius: 12,
          minWidth: 320,
          boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
        }}
      >
        <h2>{title}</h2>
        <p>{message}</p>
        <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
          <button onClick={onConfirm}>{confirmText}</button>
          <button onClick={onCancel}>{cancelText}</button>
        </div>
      </div>
    </div>
  );
}
