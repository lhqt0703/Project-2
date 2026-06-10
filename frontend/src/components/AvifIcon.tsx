import React from "react";
import dropOfBloodIcon from "../assets/drop-of-blood_1fa78.avif";
import sunWithFaceIcon from "../assets/sun-with-face_1f31e.avif";
import wolfIcon from "../assets/wolf_1f43a.avif";
import crescentMoonIcon from "../assets/crescent-moon_1f319.avif";
import leafFlutteringIcon from "../assets/leaf-fluttering-in-wind_1f343.avif";
import collisionIcon from "../assets/collision_1f4a5.avif";
import crystalBallIcon from "../assets/crystal-ball_1f52e.avif";
import directHitIcon from "../assets/direct-hit_1f3af.avif";
import balanceScaleIcon from "../assets/balance-scale_2696-fe0f.avif";
import ballotBoxIcon from "../assets/ballot-box-with-ballot_1f5f3-fe0f.avif";
import shieldIcon from "../assets/shield_1f6e1-fe0f.avif";
import testTubeIcon from "../assets/test-tube_1f9ea.avif";
import sunBehindCloudIcon from "../assets/sun-behind-cloud_26c5.avif";
import skullIcon from "../assets/skull_1f480.avif";
import scrollIcon from "../assets/scroll_1f4dc.avif";
import heartIcon from "../assets/tim.avif";

const iconMap: Record<string, string> = {
  "🩸": dropOfBloodIcon,
  "🌞": sunWithFaceIcon,
  "🐺": wolfIcon,
  "🌙": crescentMoonIcon,
  "☮️": leafFlutteringIcon,
  "☮": leafFlutteringIcon,
  "💥": collisionIcon,
  "🔮": crystalBallIcon,
  "🎯": directHitIcon,
  "⚖️": balanceScaleIcon,
  "⚖": balanceScaleIcon,
  "🗳️": ballotBoxIcon,
  "🗳": ballotBoxIcon,
  "🛡️": shieldIcon,
  "🛡": shieldIcon,
  "🧪": testTubeIcon,
  "🌥️": sunBehindCloudIcon,
  "🌥": sunBehindCloudIcon,
  "💀": skullIcon,
  "📜": scrollIcon,
  "♥️": heartIcon,
  "♥": heartIcon,
};

interface AvifIconProps {
  name: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const AvifIcon: React.FC<AvifIconProps> = ({ name, alt, className, style }) => {
  const src = iconMap[name];
  if (!src) {
    return <span className={className} style={style}>{name}</span>;
  }
  return (
    <img
      src={src}
      alt={alt || name}
      className={className}
      style={{
        width: "1.25em",
        height: "1.25em",
        display: "inline-block",
        verticalAlign: "middle",
        ...style,
      }}
    />
  );
};
