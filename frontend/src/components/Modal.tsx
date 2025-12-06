interface ModalProps {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
}

export default function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "white",
          padding: 25,
          borderRadius: 12,
          width: "90%",
          maxWidth: 400,
          boxShadow: "0 4px 25px rgba(0,0,0,0.2)",
          animation: "fadeIn 0.2s ease-out",
        }}
      >
        <h2 style={{ marginTop: 0 }}>{title}</h2>

        <div>{children}</div>

        {onClose && (
          <button
            onClick={onClose}
            style={{
              marginTop: 20,
              width: "100%",
              padding: 10,
              background: "#ccc",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Đóng
          </button>
        )}
      </div>
    </div>
  );
}
