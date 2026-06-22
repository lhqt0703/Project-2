import React from "react";
import dropOfBloodIcon from "../assets/icon/drop-of-blood_1fa78.avif";
import sunWithFaceIcon from "../assets/icon/sun-with-face_1f31e.avif";
import wolfIcon from "../assets/icon/wolf_1f43a.avif";
import crescentMoonIcon from "../assets/icon/crescent-moon_1f319.avif";
import leafFlutteringIcon from "../assets/icon/leaf-fluttering-in-wind_1f343.avif";
import collisionIcon from "../assets/icon/collision_1f4a5.avif";
import crystalBallIcon from "../assets/icon/crystal-ball_1f52e.avif";
import directHitIcon from "../assets/icon/direct-hit_1f3af.avif";
import balanceScaleIcon from "../assets/icon/balance-scale_2696-fe0f.avif";
import ballotBoxIcon from "../assets/icon/ballot-box-with-ballot_1f5f3-fe0f.avif";
import shieldIcon from "../assets/icon/shield_1f6e1-fe0f.avif";
import testTubeIcon from "../assets/icon/test-tube_1f9ea.avif";
import sunBehindCloudIcon from "../assets/icon/sun-behind-cloud_26c5.avif";
import skullIcon from "../assets/icon/skull_1f480.avif";
import scrollIcon from "../assets/icon/scroll_1f4dc.avif";
import heartIcon from "../assets/icon/tim.avif";
import pinkHeartIcon from "../assets/icon/Tym 5.avif";
import birdIcon from "../assets/icon/chim.avif";
import wingIcon from "../assets/icon/wing.avif";
import noneIcon from "../assets/icon/none.avif";
import okIcon from "../assets/icon/ok.avif";

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
  "💖": pinkHeartIcon,
  "🕊️": birdIcon,
  "🕊": birdIcon,
  "🪽": wingIcon,
  "⭕": noneIcon,
  "✅": okIcon,
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
