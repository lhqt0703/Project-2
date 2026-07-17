import trashIcon from "../assets/trash-x.svg";
import "./StickerTrashZone.css";

interface StickerTrashZoneProps {
  visible: boolean;
  active: boolean;
}

export function StickerTrashZone({ visible, active }: StickerTrashZoneProps) {
  const className = [
    "sticker-trash-zone",
    visible ? "sticker-trash-zone--visible" : "",
    active ? "sticker-trash-zone--active" : "",
  ].filter(Boolean).join(" ");

  return (
    <div id="sticker-trash-zone" className={className}>
      <div className="sticker-trash-zone__base" />
      <div className="sticker-trash-zone__active-background" />
      <img className="sticker-trash-zone__icon" src={trashIcon} alt="Thùng rác" />
    </div>
  );
}
