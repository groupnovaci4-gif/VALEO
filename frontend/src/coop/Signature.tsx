import React, { useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { C } from "./lib";

export type Sig = { paths: string[]; w: number; h: number };

export function SignaturePad({ value, onChange, height = 170 }: { value?: Sig | null; onChange: (s: Sig | null) => void; height?: number }) {
  const [w, setW] = useState(0);
  const [paths, setPaths] = useState<string[]>(value?.paths || []);
  const [cur, setCur] = useState("");
  const curRef = useRef("");

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          curRef.current = `M${x.toFixed(1)} ${y.toFixed(1)}`;
          setCur(curRef.current);
        },
        onPanResponderMove: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          curRef.current += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
          setCur(curRef.current);
        },
        onPanResponderRelease: () => {
          if (!curRef.current) return;
          setPaths((prev) => {
            const next = [...prev, curRef.current];
            onChange({ paths: next, w, h: height });
            return next;
          });
          curRef.current = "";
          setCur("");
        },
      }),
    [w, height, onChange],
  );

  const clear = () => {
    setPaths([]);
    setCur("");
    curRef.current = "";
    onChange(null);
  };

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  return (
    <View>
      <View
        onLayout={onLayout}
        {...pan.panHandlers}
        style={{ height, borderRadius: 12, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", backgroundColor: "#fff", overflow: "hidden" }}
      >
        {w > 0 ? (
          <Svg width={w} height={height}>
            {paths.map((d, i) => (
              <Path key={i} d={d} stroke={C.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {cur ? <Path d={cur} stroke={C.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          </Svg>
        ) : null}
        {paths.length === 0 && !cur ? (
          <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: C.muted, fontSize: 13 }}>Signez ici avec le doigt</Text>
          </View>
        ) : null}
      </View>
      <Pressable onPress={clear} style={{ alignSelf: "flex-end", marginTop: 8 }} testID="sig-clear">
        <Text style={{ color: C.loss, fontSize: 13, fontWeight: "600" }}>Effacer</Text>
      </Pressable>
    </View>
  );
}

export function SigPreview({ sig, height = 110 }: { sig: Sig; height?: number }) {
  const scale = height / sig.h;
  const w = Math.min(300, Math.round(sig.w * scale));
  return (
    <Svg width={w} height={height} viewBox={`0 0 ${sig.w} ${sig.h}`}>
      {sig.paths.map((d, i) => (
        <Path key={i} d={d} stroke={C.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

export function sigToSvg(sig: Sig, height = 90): string {
  const scale = height / sig.h;
  const w = Math.round(sig.w * scale);
  const paths = sig.paths.map((d) => `<path d="${d}" stroke="#241C15" stroke-width="${2.4}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  return `<svg width="${w}" height="${height}" viewBox="0 0 ${sig.w} ${sig.h}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
}
