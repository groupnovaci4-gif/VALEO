import React, { useRef } from "react";
import { View, Text } from "react-native";
import Svg, { Path, Circle, Rect, Ellipse, G, Defs, LinearGradient, Stop } from "react-native-svg";

export function ValeoMark({ size = 56 }: { size?: number }) {
  const u = useRef(Math.random().toString(36).slice(2, 7)).current;
  const gL = `vlleaf${u}`,
    gB = `vlbar${u}`,
    gP = `vlpod${u}`;
  return (
    <Svg viewBox="0 0 100 100" width={size} height={size}>
      <Defs>
        <LinearGradient id={gL} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#8FD24F" />
          <Stop offset="1" stopColor="#1E7A3E" />
        </LinearGradient>
        <LinearGradient id={gB} x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#2E9A4E" />
          <Stop offset="1" stopColor="#8FD24F" />
        </LinearGradient>
        <LinearGradient id={gP} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#E3AC3D" />
          <Stop offset="1" stopColor="#A9701C" />
        </LinearGradient>
      </Defs>
      <Path d="M52 9 A41 41 0 0 1 90 55" fill="none" stroke="#3DA35A" strokeWidth={2.4} strokeLinecap="round" />
      <Circle cx={88} cy={42} r={3.6} fill="#3DA35A" />
      <Circle cx={83} cy={56} r={3.6} fill="#6FBF3F" />
      <Path d="M49 12 C31 15 20 31 24 50 C42 47 55 33 49 12 Z" fill={`url(#${gL})`} />
      <Path d="M45 20 C39 31 33 41 27 47" stroke="#1E6B34" strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <Rect x={40} y={46} width={6.5} height={20} rx={2} fill={`url(#${gB})`} />
      <Rect x={49} y={37} width={6.5} height={29} rx={2} fill={`url(#${gB})`} />
      <Rect x={58} y={29} width={6.5} height={37} rx={2} fill={`url(#${gB})`} />
      <Path d="M28 68 Q50 61 72 68" stroke="#2E9A4E" strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Path d="M31 73 Q50 67 69 73" stroke="#4FB05F" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Path d="M20 70 C25 85 39 91 50 91 C61 91 75 85 80 70 C74 81 62 85 50 85 C38 85 26 81 20 70 Z" fill="#7A4A22" />
      <G transform="translate(72,55) rotate(38)">
        <Ellipse cx={0} cy={0} rx={10.5} ry={6.6} fill={`url(#${gP})`} />
        <Path d="M-8.5 0 Q0 -3.2 8.5 0 Q0 3.2 -8.5 0 Z" fill="#F4E7C4" />
        <Circle cx={-3.2} cy={0} r={1.3} fill="#E7D3A0" />
        <Circle cx={0} cy={-0.4} r={1.3} fill="#E7D3A0" />
        <Circle cx={3.2} cy={0.2} r={1.3} fill="#E7D3A0" />
      </G>
    </Svg>
  );
}

function RingO({ h, mono }: { h: number; mono?: boolean }) {
  const u = useRef(Math.random().toString(36).slice(2, 7)).current;
  const g = `ring${u}`;
  return (
    <Svg viewBox="0 0 100 100" width={h} height={h}>
      <Defs>
        <LinearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#B79B22" />
          <Stop offset="1" stopColor="#7A5A12" />
        </LinearGradient>
      </Defs>
      <Circle cx={50} cy={50} r={40} fill="none" stroke={mono ? "#fff" : `url(#${g})`} strokeWidth={15} />
      <Circle cx={50} cy={50} r={11} fill={mono ? "#fff" : "#2E7D32"} />
    </Svg>
  );
}

export function ValeoWordmark({ size = 38, mono = false }: { size?: number; mono?: boolean }) {
  const g1 = mono ? "#fff" : "#3B9B3F";
  const g2 = mono ? "#fff" : "#17501D";
  const leaf = mono ? "#fff" : "#6FBF3F";
  const letter = { fontSize: size, fontWeight: "900" as const, lineHeight: size * 1.05 };
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Text style={[letter, { color: g1 }]}>V</Text>
      <View>
        <Text style={[letter, { color: g1 }]}>A</Text>
        <View style={{ position: "absolute", left: size * 0.28, top: size * 0.12 }}>
          <Svg viewBox="0 0 20 26" width={size * 0.34} height={size * 0.44}>
            <Path d="M10 1 C4 5 2 13 4 23 C12 20 17 10 10 1 Z" fill={leaf} />
            <Path d="M8 6 C7 12 6 17 5 21" stroke={mono ? "#CFEFCB" : "#2E7D32"} strokeWidth={1.1} fill="none" strokeLinecap="round" />
          </Svg>
        </View>
      </View>
      <Text style={[letter, { color: g1 }]}>L</Text>
      <Text style={[letter, { color: g2 }]}>E</Text>
      <View style={{ width: size * 0.1 }} />
      <RingO h={size * 0.82} mono={mono} />
    </View>
  );
}
