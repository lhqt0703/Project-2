import React, { useState } from "react";
import DecryptedText from "./DecryptedText";
import { ActiveRolesModal } from "./ActiveRolesModal";
import { StickerSelectorModal } from "./StickerSelectorModal";

const EyeIcon = ({ isOpen }: { isOpen: boolean }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
    >
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.875 0Z" />
      <circle cx="12" cy="12" r="3" />
      <line
        x1="3"
        y1="3"
        x2="21"
        y2="21"
        style={{
          strokeDasharray: 26,
          strokeDashoffset: isOpen ? 26 : 0,
          transition: "stroke-dashoffset 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </svg>
  );
};

const RolePlayIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ overflow: "visible" }}
    >
      <path d="m4.976 9.161-2.998 2.998c-.037-.231 0-6.15-.013-6.381 0-1.465.936-2.761 2.329-3.224l7.708-2.554 5.828 1.932c-1.357.546-2.618 1.203-3.75 1.929l-2.078-.689-6.759 2.241c-.159.053-.267.2-.267.366v3.383zm14.052 2.343v.459c0 3.689-2.466 6.089-4.603 7.478l-3.863 3.863c.283.152 1.085.548 1.376.696l1.024-.414c2.129-.857 9.077-4.226 9.077-11.624v-5.723c-.817 2-1.885 3.77-3.011 5.264zm-7.868 8.364-1.471-1.471 5.222-5.222c2.801-2.777 5.155-6.311 6.101-10.182-3.881.931-7.409 3.289-10.191 6.092l-5.222 5.221-1.465-1.465-2.129 2.129 2.448 2.448-2.448 2.448 2.129 2.129 2.448-2.448 2.448 2.448 2.129-2.129z" />
    </svg>
  );
};

const StickersIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ overflow: "visible" }}
    >
      <path d="m20,0H4C1.794,0,0,1.794,0,4v12c0,2.206,1.794,4,4,4h2.923l3.749,3.157c.382.339.861.507,1.337.507.468,0,.931-.163,1.292-.484l3.848-3.18h2.852c2.206,0,4-1.794,4-4V4c0-2.206-1.794-4-4-4ZM7,12c-.828,0-1.5-.672-1.5-1.5s.672-1.5,1.5-1.5,1.5.672,1.5,1.5-.672,1.5-1.5,1.5Zm5,0c-.828,0-1.5-.672-1.5-1.5s.672-1.5,1.5-1.5,1.5.672,1.5,1.5-.672,1.5-1.5,1.5Zm5,0c-.828,0-1.5-.672-1.5-1.5s.672-1.5,1.5-1.5,1.5.672,1.5,1.5-.672,1.5-1.5,1.5Z"/>
    </svg>
  );
};

interface GameRoleStatusBarProps {
  isHost: boolean;
  role: string | null;
  cardFlippedToFront: boolean;
  lowPerformanceMode: boolean;
  setLowPerformanceMode: React.Dispatch<React.SetStateAction<boolean>>;
  showLowPerfToast: boolean;
  isAnimatingLeaf: boolean;
  setIsAnimatingLeaf: React.Dispatch<React.SetStateAction<boolean>>;
  phase?: string;
  roles?: string[];
  gameMode?: string;

  // Night EyeIcon options
  showEyeIcon?: boolean;
  isNightInfoVisible?: boolean;
  setIsNightInfoVisible?: React.Dispatch<React.SetStateAction<boolean>>;

  // Stickers options
  showStickersButton?: boolean;
  isWolf?: boolean;
  isLover?: boolean;
  onSelectSticker?: (filename: string, channel: "wolf" | "lovers", event: React.MouseEvent | React.TouchEvent | null) => void;
  onSendPlayerMessage?: (text: string, channel: "wolf" | "lovers") => void;
}

export const GameRoleStatusBar: React.FC<GameRoleStatusBarProps> = ({
  isHost,
  role,
  cardFlippedToFront,
  lowPerformanceMode,
  setLowPerformanceMode,
  showLowPerfToast,
  isAnimatingLeaf,
  setIsAnimatingLeaf,
  phase = "",
  roles = [],
  gameMode,
  showEyeIcon = false,
  isNightInfoVisible = false,
  setIsNightInfoVisible,
  showStickersButton = false,
  isWolf = false,
  isLover = false,
  onSelectSticker,
  onSendPlayerMessage,
}) => {
  const [isRolesModalOpen, setIsRolesModalOpen] = useState(false);
  const [isStickersOpen, setIsStickersOpen] = useState(false);

  if (isHost) return null;

  const shouldShowLowPerfToast = showLowPerfToast && phase === "dusk";

  return (
    <>
      <style>{`
        @keyframes gentleBob {
          0% {
            transform: translateY(0px) rotate(-45deg);
          }
          50% {
            transform: translateY(2.5px) rotate(-45deg);
          }
          100% {
            transform: translateY(0px) rotate(-45deg);
          }
        }
        @keyframes leaf3DFly {
          0% {
            transform: translateY(0) rotateY(0deg) rotate(-45deg);
          }
          50% {
            transform: translateY(-4dvh) rotateY(-360deg) rotate(-45deg);
          }
          100% {
            transform: translateY(0) rotateY(0deg) rotate(-45deg);
          }
        }
      `}</style>
      <h2 style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: "8px", 
        flexWrap: "wrap", 
        justifyContent: "space-between",
        minHeight: "40px",
        height: "40px",
        width: "100%",
        position: "relative"
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          whiteSpace: "nowrap",
          transition: "max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease",
          maxWidth: shouldShowLowPerfToast ? "0" : "500px",
          opacity: shouldShowLowPerfToast ? 0 : 1,
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexShrink: 0,
            whiteSpace: "nowrap",
            position: "absolute",
            transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
            transform: shouldShowLowPerfToast ? "translateX(-100%)" : "translateX(0)",
          }}>
            <span style={{ flexShrink: 0 }}>Vai trò:</span>
            <span id="role-name" style={{ display: "inline-flex", alignItems: "center", height: "40px", whiteSpace: "nowrap", overflow: "hidden", flexShrink: 0 }}>
              <DecryptedText
                text={cardFlippedToFront && role ? role : "********"}
                speed={40}
                maxIterations={8}
                sequential
                revealDirection={cardFlippedToFront ? "start" : "end"}
                animateOn="view"
                style={{ whiteSpace: "nowrap"}}
              />
            </span>
          </div>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            overflow: "hidden",
            whiteSpace: "nowrap",
            transition: "max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease",
            paddingRight: "0.8rem",
            maxWidth: shouldShowLowPerfToast ? "300px" : "0px",
            opacity: shouldShowLowPerfToast ? 1 : 0,
          }}>
            <span style={{
              display: "inline-block",
              fontSize: "24px",
              color: "#fff",
              fontWeight: 700,
              textShadow: "0 0 8px rgba(16, 185, 129, 0.4)",
              transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
              transform: shouldShowLowPerfToast ? "translateX(0)" : "translateX(100%)",
            }}>
              Đã bật chế độ đồ họa thấp
            </span>
          </div>

          <div style={{
            transition: "max-width 0.4s ease, opacity 0.4s ease, transform 0.4s ease",
            maxWidth: phase === "dusk" ? "50px" : "0px",
            opacity: phase === "dusk" ? 1 : 0,
            transform: phase === "dusk" ? "translateX(0)" : "translateX(100px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: phase === "dusk" ? "auto" : "none",
          }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setLowPerformanceMode(p => !p);
                setIsAnimatingLeaf(true);
              }}
              title="Tối ưu hiệu năng di động"
              style={{
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px",
                borderRadius: "50%",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                backgroundColor: lowPerformanceMode ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.05)",
                boxShadow: lowPerformanceMode ? "0 0 15px rgba(16, 185, 129, 0.5), inset 0 0 8px rgba(16, 185, 129, 0.3)" : "none",
                border: lowPerformanceMode ? "1px solid rgba(16, 185, 129, 0.5)" : "1px solid rgba(255, 255, 255, 0.1)",
                outline: "none",
                userSelect: "none",
                perspective: "400px",
              }}
            >
              <svg
                height="22"
                viewBox="0 0 30 30"
                width="22"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  transform: "translateY(0px) rotate(-45deg)",
                  display: "block",
                  filter: lowPerformanceMode ? "drop-shadow(0 0 6px rgba(16, 185, 129, 0.8))" : "none",
                  transition: "all 0.3s ease",
                  animation: isAnimatingLeaf
                    ? "leaf3DFly 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards"
                    : (lowPerformanceMode ? "gentleBob 3.5s ease-in-out infinite" : "none"),
                  transformStyle: "preserve-3d",
                }}
                onAnimationEnd={() => setIsAnimatingLeaf(false)}
              >
                <g fill="none" fillRule="evenodd">
                  <g transform="translate(-450 -44)">
                    <g transform="translate(449 40)">
                      <path
                        d="m23.6927469 29.6472387c2.6828915-2.2634443 4.2921773-5.3077228 4.2921773-9.0321629 0-.8160058-.0940967-1.6579238-.2767828-2.5232792-.6251216-2.9611024-2.2514506-6.099632-4.5695216-9.27172914-1.0509363-1.43812332-2.1759983-2.78819777-3.3012368-4.01214133-.3940924-.42866192-.7603031-.81118168-1.0893806-1.14273337-.1985344-.20002717-.3413556-.33934047-.4192058-.41309334-.1928481-.18269821-.4948966-.18269821-.6877447 0-.0778502.07375287-.2206714.21306617-.4192059.41309334-.3290774.33155169-.6952882.71407145-1.0893806 1.14273337-1.1252384 1.22394356-2.2503004 2.57401801-3.3012367 4.01214133-2.318071 3.17209714-3.94439999 6.31062674-4.5695216 9.27172914-.18268615.8653554-.27678286 1.7072734-.27678286 2.5232792 0 3.7244401 1.60928585 6.7687186 4.29217726 9.0321629 1.9448996 1.6408312 4.4617414 2.7678371 5.7078227 2.7678371 1.2460814 0 3.7629231-1.1270059 5.7078227-2.7678371z"
                        fill={lowPerformanceMode ? "#4caf50" : "none"}
                        stroke="#4caf50"
                        strokeWidth={lowPerformanceMode ? "0" : "1.8"}
                        transform="matrix(.707 .707 -.707 .707 17.829 -7.514)"
                        style={{ transition: "fill 0.3s ease, stroke-width 0.3s ease" }}
                      />
                      <path
                        d="m12.9943854 22.0490888-3.1450267-3.1450267c-.20305299-.203053-.51326456-.1966821-.7085267-.0014199-.18955158.1895515-.19515261.5119541.00024466.7073514l3.85330874 3.8533087v10.7923818c0 .2764249.2319336.5005115.5.5005115.2761424 0 .5-.2269016.5-.5005115v-10.7923818l3.8533087-3.8533087c.1971842-.1971842.1955068-.5120893.0002447-.7073514-.1895516-.1895516-.5124804-.1946265-.7085267.0014199l-3.1450267 3.1450267v-5.5857865l1.8531998-1.8531998c.1926722-.1926721.1956157-.5121982.0003536-.7074603-.1895516-.1895516-.5095255-.1975813-.7019268-.00518l-1.1516266 1.1516266v-4.7935088c0-.283258-.2238576-.49938444-.5-.49938444-.2680664 0-.5.22358205-.5.49938444v4.7935088l-1.1516266-1.1516266c-.1914368-.1914368-.5066647-.1900822-.7019268.00518-.1895516-.1895515-.1951039.5120029.0003535.7074603l1.8531999 1.8531998z"
                        fill="#607d8b"
                        transform="matrix(.707 .707 -.707 .707 19.69 -3.024)"
                      />
                    </g>
                  </g>
                </g>
              </svg>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Nút Danh sách vai trò */}
            <div style={{
              transition: "max-width 0.4s ease, opacity 0.4s ease, transform 0.4s ease",
              maxWidth: phase === "dusk" ? "0px" : "50px",
              opacity: phase === "dusk" ? 0 : 1,
              transform: phase === "dusk" ? "translateX(100px)" : "translateX(0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: phase === "dusk" ? "none" : "auto",
            }}>
              <div
                onClick={() => setIsRolesModalOpen(true)}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "50%",
                  cursor: "pointer",
                  width: "32px",
                  height: "32px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  transition: "all 0.2s ease",
                  padding: 0,
                  boxShadow: "0 0 8px rgba(52, 211, 153, 0.2)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.1)";
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                }}
                title="Danh sách vai trò"
              >
                <RolePlayIcon />
              </div>
            </div>

            {/* Nút Sticker */}
            {showStickersButton && onSelectSticker && (
              <div style={{
                transition: "max-width 0.4s ease, opacity 0.4s ease, transform 0.4s ease",
                maxWidth: phase === "night" ? "50px" : "0px",
                opacity: phase === "night" ? 1 : 0,
                transform: phase === "night" ? "translateX(0)" : "translateX(100px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: phase === "night" ? "auto" : "none",
              }}>
                <div
                  onClick={() => setIsStickersOpen(true)}
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "50%",
                    cursor: "pointer",
                    width: "32px",
                    height: "32px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff",
                    transition: "all 0.2s ease",
                    padding: 0,
                    boxShadow: "0 0 8px rgba(52, 211, 153, 0.2)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.1)";
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                  }}
                  title="Dán Sticker"
                >
                  <StickersIcon />
                </div>
              </div>
            )}

            {setIsNightInfoVisible && (() => {
              const isEyeOpen = phase === "night" && isNightInfoVisible;
              return (
                <div style={{
                  transition: "max-width 0.4s ease, opacity 0.4s ease, transform 0.4s ease",
                  transitionDelay: showEyeIcon ? "0.2s" : "0.2s",
                  maxWidth: showEyeIcon ? "50px" : "0px",
                  opacity: showEyeIcon ? 1 : 0,
                  transform: showEyeIcon ? "translateX(0)" : "translateX(100px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: showEyeIcon ? "auto" : "none",
                }}>
                  <div
                    onClick={() => setIsNightInfoVisible((p) => !p)}
                    style={{
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "50%",
                      cursor: "pointer",
                      width: "32px",
                      height: "32px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: isEyeOpen ? "#34d399" : "#f87171",
                      transition: "all 0.2s ease",
                      padding: 0,
                      boxShadow: isEyeOpen 
                        ? "0 0 8px rgba(52, 211, 153, 0.2)" 
                        : "0 0 8px rgba(248, 113, 113, 0.2)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "scale(1.1)";
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "scale(1)";
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                    }}
                    title={isNightInfoVisible ? "Ẩn màn hình" : "Hiện màn hình"}
                  >
                    <EyeIcon isOpen={isEyeOpen} />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </h2>
      <ActiveRolesModal
        open={isRolesModalOpen}
        onClose={() => setIsRolesModalOpen(false)}
        roles={roles}
        gameMode={gameMode}
      />
      <StickerSelectorModal
        isOpen={isStickersOpen}
        onClose={() => setIsStickersOpen(false)}
        onSelectSticker={onSelectSticker || (() => {})}
        onSendPlayerMessage={onSendPlayerMessage}
        isWolf={isWolf}
        isLover={isLover}
      />
    </>
  );
};
