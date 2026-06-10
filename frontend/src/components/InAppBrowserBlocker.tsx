import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export default function InAppBrowserBlocker() {
  const [copied, setCopied] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const android = /Android/i.test(ua);
    setIsIOS(ios);
    setIsAndroid(android);
  }, []);

  const getCleanUrl = () => {
    try {
      const url = new URL(window.location.href);

      // Nếu chạy trên domain thực tế (không phải localhost hoặc IP mạng nội bộ), ép giao thức thành HTTPS
      const isLocal = /localhost|127\.0\.0\.1|192\.168\./i.test(url.hostname);
      if (!isLocal && url.protocol === 'http:') {
        url.protocol = 'https:';
      }

      // Xoá tham số theo dõi của Facebook và UTM
      url.searchParams.delete('fbclid');
      url.searchParams.delete('utm_source');
      url.searchParams.delete('utm_medium');
      url.searchParams.delete('utm_campaign');
      url.searchParams.delete('utm_term');
      url.searchParams.delete('utm_content');
      // Xoá các tham số test/bypass để link chia sẻ sạch nhất
      url.searchParams.delete('forceBlocker');
      url.searchParams.delete('bypass');

      const cleanSearch = url.searchParams.toString();
      if (!cleanSearch) {
        return `${url.origin}${url.pathname}`;
      }
      return `${url.origin}${url.pathname}?${cleanSearch}`;
    } catch (e) {
      let fallbackUrl = window.location.origin + window.location.pathname;
      const isLocal = /localhost|127\.0\.0\.1|192\.168\./i.test(window.location.hostname);
      if (!isLocal && fallbackUrl.startsWith('http://')) {
        fallbackUrl = fallbackUrl.replace('http://', 'https://');
      }
      return fallbackUrl;
    }
  };

  const handleOpenBrowser = () => {
    if (isAndroid) {
      // Trên Android: Sử dụng intent scheme để ép mở bằng trình duyệt hệ thống ngoài
      const cleanUrl = getCleanUrl();
      // Loại bỏ protocol (http:// hoặc https://) để build intent
      const urlWithoutProtocol = cleanUrl.replace(/^https?:\/\//, '');
      const intentUrl = `intent://${urlWithoutProtocol}#Intent;scheme=https;end;`;
      window.location.href = intentUrl;
    } else if (isIOS) {
      // Trên iOS: Không thể mở tự động, kích hoạt hiển thị hướng dẫn chỉ vào menu Messenger
      setShowIOSHint(true);
    } else {
      // Trường hợp khác hoặc trên PC (khi debug): Cho chạy thử sao chép
      setShowIOSHint(true);
    }
  };

  const handleCopyLink = async () => {
    const textToCopy = getCleanUrl();
    
    // 1. Thử dùng Modern Clipboard API nếu có hỗ trợ và đang ở môi trường bảo mật (HTTPS/localhost)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch (err) {
        console.warn('Modern Clipboard API failed, trying fallback...', err);
      }
    }

    // 2. Fallback sử dụng textarea tạm thời (tương thích cực kỳ cao trên mọi webview/HTTP thường)
    try {
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      
      // Định dạng style để ẩn textarea đi mà không làm ảnh hưởng layout
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.width = '2em';
      textArea.style.height = '2em';
      textArea.style.padding = '0';
      textArea.style.border = 'none';
      textArea.style.outline = 'none';
      textArea.style.boxShadow = 'none';
      textArea.style.background = 'transparent';
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        console.error('execCommand copy failed');
        alert('Không thể tự động sao chép. Vui lòng tự bôi đen và sao chép liên kết trên thanh địa chỉ.');
      }
    } catch (err) {
      console.error('Fallback copy failed', err);
      alert('Không thể tự động sao chép. Vui lòng tự bôi đen và sao chép liên kết trên thanh địa chỉ.');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        backgroundColor: '#0f1115',
        backgroundImage: `
          radial-gradient(circle at 10% 20%, rgba(114, 84, 255, 0.15), transparent 40%),
          radial-gradient(circle at 90% 80%, rgba(255, 152, 0, 0.12), transparent 45%)
        `,
        color: '#e8e8e8',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Background glowing orb anim */}
      <div
        style={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(255, 152, 0, 0.08) 0%, transparent 70%)',
          filter: 'blur(40px)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Main Container Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'linear-gradient(135deg, rgba(23, 26, 33, 0.9) 0%, rgba(15, 17, 21, 0.95) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          padding: '32px 24px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
          backdropFilter: 'blur(16px)',
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Animated browser icon header */}
        <div style={{ marginBottom: '24px', position: 'relative', display: 'inline-block' }}>
          <motion.div
            animate={{
              scale: [1, 1.05, 1],
              rotate: [0, 5, -5, 0],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, #3a2a12 0%, #171a21 100%)',
              border: '1px solid var(--accent)',
              boxShadow: '0 0 20px rgba(255, 152, 0, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '38px',
              margin: '0 auto',
            }}
          >
            🌐
          </motion.div>
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: '22px',
            fontWeight: 800,
            margin: '0 0 12px 0',
            background: 'linear-gradient(90deg, #ffffff 0%, #ffbe5c 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.5px',
          }}
        >
          Mở Bằng Trình Duyệt Ngoài
        </h2>

        {/* Description */}
        <p
          style={{
            fontSize: '14px',
            lineHeight: '1.6',
            color: 'rgba(232, 232, 232, 0.75)',
            margin: '0 0 28px 0',
          }}
        >
          Bạn đang mở game trong trình duyệt tích hợp của {isIOS ? 'Messenger / Facebook' : 'ứng dụng mạng xã hội'}. Để tránh bị ngắt kết nối và có trải nghiệm chơi game tốt nhất, hãy chuyển sang trình duyệt hệ thống.
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Main action button */}
          <button
            onClick={handleOpenBrowser}
            className="button-gradient visible"
            style={{
              width: '100%',
              height: '50px',
              borderRadius: '14px',
              fontWeight: 700,
              fontSize: '16px',
              border: '1px solid rgba(255, 152, 0, 0.3)',
              background: 'linear-gradient(135deg, #ff9800 0%, #e65100 100%)',
              color: '#000000',
              boxShadow: '0 8px 24px rgba(255, 152, 0, 0.2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
          >
            <span>🚀</span>
            <span>{isAndroid ? 'Mở Trình Duyệt Ngay' : 'Cách Mở Bằng Safari'}</span>
          </button>

          {/* Secondary copy button */}
          <button
            onClick={handleCopyLink}
            style={{
              width: '100%',
              height: '48px',
              borderRadius: '14px',
              fontWeight: 600,
              fontSize: '14px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#e8e8e8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }}
          >
            <AnimatePresence mode="wait">
              {copied ? (
                <motion.div
                  key="copied"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4caf50' }}
                >
                  <span>✓</span>
                  <span>Đã sao chép liên kết!</span>
                </motion.div>
              ) : (
                <motion.div
                  key="copy"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <span>📋</span>
                  <span>Sao chép liên kết game</span>
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Visual instruction summary below buttons */}
        {isIOS && (
          <div style={{ marginTop: '24px', fontSize: '12px', color: 'rgba(232, 232, 232, 0.5)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
            Mẹo: Nhấn nút chia sẻ <span style={{ fontSize: '14px' }}>⎋</span> hoặc ba chấm <span style={{ fontWeight: 'bold' }}>•••</span> rồi chọn <strong>"Mở bằng Safari"</strong>.
          </div>
        )}
        {isAndroid && (
          <div style={{ marginTop: '24px', fontSize: '12px', color: 'rgba(232, 232, 232, 0.5)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
            Mẹo: Nếu nút không hoạt động, nhấn dấu ba chấm ở góc trên bên phải và chọn <strong>"Mở bằng trình duyệt"</strong>.
          </div>
        )}
      </motion.div>

      {/* Animated iOS Guide - Bouncing arrow pointing to bottom right share button */}
      <AnimatePresence>
        {showIOSHint && isIOS && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 999999,
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              pointerEvents: 'auto',
            }}
            onClick={() => setShowIOSHint(false)}
          >
            {/* Guide Text in Center */}
            <div
              style={{
                position: 'absolute',
                top: '40%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '85%',
                maxWidth: '320px',
                textAlign: 'center',
                color: '#ffffff',
              }}
            >
              <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 16px 0', color: 'var(--accent)' }}>
                Cách mở bằng Safari
              </h3>
              <ol style={{ paddingLeft: '20px', textAlign: 'left', fontSize: '15px', lineHeight: '1.8', margin: 0 }}>
                <li style={{ marginBottom: '10px' }}>
                  Nhìn xuống <strong>thanh công cụ dưới cùng</strong> của Messenger.
                </li>
                <li style={{ marginBottom: '10px' }}>
                  Nhấn vào biểu tượng <strong>Chia sẻ</strong> (hình vuông có mũi tên đi lên) hoặc nút <strong>Ba chấm (•••)</strong> ở góc dưới bên phải.
                </li>
                <li>
                  Chọn <strong>"Mở bằng trình duyệt Safari"</strong> để vào chơi game.
                </li>
              </ol>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowIOSHint(false);
                }}
                style={{
                  marginTop: '28px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  padding: '8px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Tôi đã hiểu
              </button>
            </div>

            {/* Bouncing Arrow Pointing to Bottom Right Menu */}
            <motion.div
              animate={{
                y: [0, -15, 0],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{
                position: 'absolute',
                bottom: '120px',
                right: '40px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                zIndex: 1000000,
              }}
            >
              <div
                style={{
                  background: 'var(--accent)',
                  color: '#000000',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 15px rgba(255, 152, 0, 0.4)',
                }}
              >
                Nhấn ở đây nè!
              </div>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ filter: 'drop-shadow(0 4px 10px rgba(255, 152, 0, 0.5))' }}
              >
                <path
                  d="M12 4V20M12 20L6 14M12 20L18 14"
                  stroke="var(--accent)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.div>
          </motion.div>
        )}

        {/* Custom generic guide for other browsers / PC Debugging */}
        {showIOSHint && !isIOS && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 999999,
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
            onClick={() => setShowIOSHint(false)}
          >
            <div
              style={{
                background: '#171a21',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '20px',
                padding: '28px',
                maxWidth: '340px',
                textAlign: 'center',
                color: '#ffffff',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 12px 0', color: 'var(--accent)' }}>
                Hướng dẫn mở trình duyệt ngoài
              </h3>
              <p style={{ fontSize: '14px', lineHeight: '1.6', color: 'rgba(255,255,255,0.8)', margin: '0 0 20px 0' }}>
                Vui lòng nhấn vào biểu tượng menu chia sẻ hoặc dấu ba chấm <strong>(•••)</strong> trên góc màn hình và chọn <strong>"Mở bằng trình duyệt hệ thống"</strong> (Safari/Chrome).
              </p>
              <button
                onClick={() => setShowIOSHint(false)}
                style={{
                  background: 'var(--accent)',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 24px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                Đã hiểu
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
