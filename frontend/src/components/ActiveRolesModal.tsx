import React, { useMemo } from "react";
import { ELEMENTAL_ROLE_ORDER } from "../constants/elemental";
import nenLungAsset from "../assets/nền lưng.avif";
import coffeeMakerCardAsset from "../assets/C Người pha cà phê.avif";
import linhChiCardAsset from "../assets/C Linh Chi.avif";
import dongTrungCardAsset from "../assets/C Đông Trùng.avif";

const DIET_QUY_TOWNSFOLK = ["Thợ giặt", "Thủ thư", "Điều tra viên", "Đầu bếp", "Đồng cảm", "Thầy bói", "Chôn cất", "Nhà sư", "Nuôi quạ", "Trinh nữ", "Diệt quỷ", "Chiến sĩ", "Thị trưởng"];
const DIET_QUY_TRAVELERS = ["Người ẩn dật", "Thánh nhân"];
const DIET_QUY_MINIONS = ["Độc thủ", "Gián điệp", "Phò"];
const DIET_QUY_DEMON = ["Ác Quỷ"];

// Glob all card images
const CARD_IMAGES = import.meta.glob<string>("../assets/F *.avif", {
  eager: true,
  import: "default",
});
const COFFEE_ROLE_CARD_IMAGES: Record<string, string> = {
  "người pha cà phê": coffeeMakerCardAsset,
  "linh chi": linhChiCardAsset,
  "đông trùng": dongTrungCardAsset,
};

function getCardUrlByRoleName(roleName: string, gameMode?: string): string | null {
  if (!roleName) return null;
  let cleanName = roleName.trim();
  if (cleanName === "Sấm Sét") cleanName = "Sét";
  if (cleanName === "Băng Giá") cleanName = "Băng";
  if (gameMode === "soi_mu" && cleanName === "Tay Buôn") {
    cleanName = "Tay Buôn ari";
  }

  const entry = Object.entries(CARD_IMAGES).find(([path]) => {
    const lowerPath = path.normalize("NFC").toLowerCase();
    const targetAvif = `/f ${cleanName.normalize("NFC").toLowerCase()}.avif`;
    return lowerPath.endsWith(targetAvif);
  });
  return entry ? entry[1] : COFFEE_ROLE_CARD_IMAGES[cleanName.normalize("NFC").toLowerCase()] || null;
}

const getGlowColor = (role: string) => {
  if (DIET_QUY_TOWNSFOLK.includes(role)) return "#34d399";
  if (DIET_QUY_TRAVELERS.includes(role)) return "#60a5fa";
  if (DIET_QUY_MINIONS.includes(role)) return "#fb923c";
  if (DIET_QUY_DEMON.includes(role)) return "#f87171";

  if (["Sói", "Sói con", "Sói Dại", "Linh sói", "Bán sói"].includes(role)) return "#ef4444";
  if (ELEMENTAL_ROLE_ORDER.includes(role as any)) return "#ED6E7B";
  if (["Tiên tri", "Thợ săn"].includes(role)) return "#60a5fa";
  if (["Bảo vệ", "Phù thủy", "Hộ nhân", "Trưởng làng"].includes(role)) return "#34d399";
  if (["Người pha cà phê", "Linh Chi", "Đông Trùng"].includes(role)) return "#34d399";
  if (["Kẻ bị nguyền", "Thiên Sứ", "Thần tình yêu", "Tay Buôn", "Song Trùng"].includes(role)) return "#a855f7";
  return "#ff9800"; // fallback gold glow
};

interface ActiveRolesModalProps {
  open: boolean;
  onClose: () => void;
  roles: string[];
  gameMode?: string;
}

export const ActiveRolesModal: React.FC<ActiveRolesModalProps> = ({
  open,
  onClose,
  roles,
  gameMode,
}) => {
  if (!open) return null;

  // Group roles to count quantity
  const roleGroups = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of roles) {
      counts[r] = (counts[r] || 0) + 1;
    }
    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      glowColor: getGlowColor(name),
      cardUrl: getCardUrlByRoleName(name, gameMode),
    }));
  }, [roles, gameMode]);

  return (
    <>
      <style>{`
        @keyframes modalFadeIn {
          from {
            opacity: 0;
            backdrop-filter: blur(0px);
          }
          to {
            opacity: 1;
            backdrop-filter: blur(9px);
          }
        }
        @keyframes modalScaleIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .active-roles-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.4), rgba(3, 7, 18, 0.6));
          animation: modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .active-roles-modal {
          width: min(840px, 100%);
          max-height: min(85vh, 720px);
          display: flex;
          flex-direction: column;
          color: #f8fbff;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          background: linear-gradient(180deg, rgba(17, 24, 39, 0.6), rgba(10, 15, 30, 0.7));
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(16, 185, 129, 0.05);
          animation: modalScaleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          overflow: hidden;
        }
        .active-roles-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
        }
        .active-roles-header h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          background: linear-gradient(135deg, #fff 30%, #34d399 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .active-roles-close {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          padding: 6px 16px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.2s ease;
        }
        .active-roles-close:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.2);
          color: #ef4444;
          transform: translateY(-1px);
        }
        .active-roles-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }
        .active-roles-subtitle {
          color: rgba(255, 255, 255, 0.5);
          font-size: 14px;
          margin-bottom: 20px;
          text-align: center;
        }
        .active-roles-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
          gap: 20px;
          justify-items: center;
        }
        .active-role-card {
          position: relative;
          width: 110px;
          height: 155px;
          border-radius: 12px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          cursor: default;
        }
        .active-role-card:hover {
          transform: translateY(-6px) scale(1.03);
          box-shadow: 0 12px 20px rgba(0, 0, 0, 0.4);
        }
        .active-role-image {
          width: 100%;
          height: 100%;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          transition: transform 0.5s ease;
        }
        .active-role-card:hover .active-role-image {
          transform: scale(1.08);
        }
        .active-role-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.4) 40%, transparent 80%);
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          align-items: center;
          padding: 8px;
          text-align: center;
        }
        .active-role-name {
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
          line-height: 1.2;
        }
        .active-role-count-badge {
          position: absolute;
          top: 6px;
          right: 6px;
          background: linear-gradient(135deg, #ff9800, #f57c00);
          color: #ffffff;
          font-size: 11px;
          font-weight: 800;
          padding: 2px 7px;
          border-radius: 10px;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.4);
          z-index: 10;
          border: 1px solid rgba(255, 255, 255, 0.25);
        }
      `}</style>
      <div className="active-roles-backdrop" onClick={onClose}>
        <div className="active-roles-modal" onClick={(e) => e.stopPropagation()}>
          <div className="active-roles-header">
            <h2>DANH SÁCH VAI TRÒ TRONG VÁN CHƠI</h2>
            <button className="active-roles-close" onClick={onClose}>
              Đóng
            </button>
          </div>
          <div className="active-roles-body">
            <div className="active-roles-subtitle">
              Tổng số vai trò được thiết lập: <span style={{ color: "#34d399", fontWeight: 700 }}>{roles.length}</span>
            </div>
            <div className="active-roles-grid">
              {roleGroups.map((group) => (
                <div
                  key={group.name}
                  className="active-role-card"
                  style={{
                    borderColor: `${group.glowColor}40`,
                    boxShadow: `0 4px 12px rgba(0, 0, 0, 0.2), 0 0 10px ${group.glowColor}15`
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = group.glowColor;
                    e.currentTarget.style.boxShadow = `0 12px 24px rgba(0,0,0,0.4), 0 0 18px ${group.glowColor}40`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = `${group.glowColor}40`;
                    e.currentTarget.style.boxShadow = `0 4px 12px rgba(0, 0, 0, 0.2), 0 0 10px ${group.glowColor}15`;
                  }}
                >
                  {group.count > 1 && (
                    <div className="active-role-count-badge">x{group.count}</div>
                  )}
                  <div
                    className="active-role-image"
                    style={{
                      backgroundImage: `url(${group.cardUrl || nenLungAsset})`,
                    }}
                  />
                  <div className="active-role-overlay">
                    <span className="active-role-name">{group.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
