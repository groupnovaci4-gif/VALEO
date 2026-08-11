import React, { useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { C } from "./lib";

export type Sig = { paths: string[]; w: number; h: number };

export function SignaturePad({ value, onChange, height = 170 }: { value?: Sig | null; onChange: (s: Sig | null) => void; height?: number }) {
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  const [paths, setPaths] = useState<string[]>(value?.paths || []);
  const [cur, setCur] = useState("");
  const curRef = useRef("");

  const pan = useMemo(
    () => {
      // Coordonnées robustes : sur le web, locationX/Y peuvent manquer → repli sur offset/page.
      const xy = (e: any): { x: number; y: number } => {
        const ne = (e && e.nativeEvent) || {};
        let x = ne.locationX, y = ne.locationY;
        if (typeof x !== "number" || Number.isNaN(x)) { x = ne.offsetX; y = ne.offsetY; }
        if (typeof x !== "number" || Number.isNaN(x)) { x = 0; y = 0; }
        return { x, y };
      };
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { x, y } = xy(e);
          curRef.current = `M${x.toFixed(1)} ${y.toFixed(1)}`;
          setCur(curRef.current);
        },
        onPanResponderMove: (e) => {
          const { x, y } = xy(e);
          if (!curRef.current) curRef.current = `M${x.toFixed(1)} ${y.toFixed(1)}`;
          else curRef.current += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
          setCur(curRef.current);
        },
        onPanResponderRelease: () => {
          const cc = curRef.current;
          curRef.current = "";
          setCur("");
          // N'enregistre que les tracés réels (au moins un déplacement).
          if (!cc || cc.indexOf("L") === -1) return;
          setPaths((prev) => {
            const next = [...prev, cc];
            onChange({ paths: next, w: wRef.current || w, h: height });
            return next;
          });
        },
      });
    },
    [w, height, onChange],
  );

  const clear = () => {
    setPaths([]);
    setCur("");
    curRef.current = "";
    onChange(null);
  };

  const onLayout = (e: LayoutChangeEvent) => { const width = e.nativeEvent.layout.width; wRef.current = width; setW(width); };

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

// Dimensions sûres : si w/h n'ont pas été mesurés (0), on les déduit du tracé.
function sigDims(sig: Sig): { w: number; h: number } {
  let w = sig.w, h = sig.h;
  if (!w || !h) {
    let mx = 0, my = 0;
    sig.paths.forEach((d) => {
      const nums = d.match(/-?\d+(?:\.\d+)?/g);
      if (nums) for (let i = 0; i + 1 < nums.length; i += 2) { mx = Math.max(mx, parseFloat(nums[i])); my = Math.max(my, parseFloat(nums[i + 1])); }
    });
    w = w || Math.ceil(mx + 8) || 300;
    h = h || Math.ceil(my + 8) || 170;
  }
  return { w, h };
}

export function SigPreview({ sig, height = 110 }: { sig: Sig; height?: number }) {
  const { w: sw, h: sh } = sigDims(sig);
  const scale = height / sh;
  const w = Math.min(300, Math.round(sw * scale));
  return (
    <Svg width={w} height={height} viewBox={`0 0 ${sw} ${sh}`}>
      {sig.paths.map((d, i) => (
        <Path key={i} d={d} stroke={C.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

export function sigToSvg(sig: Sig, height = 90): string {
  const { w: sw, h: sh } = sigDims(sig);
  const scale = height / sh;
  const w = Math.round(sw * scale);
  const paths = sig.paths.map((d) => `<path d="${d}" stroke="#241C15" stroke-width="${2.4}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  return `<svg width="${w}" height="${height}" viewBox="0 0 ${sw} ${sh}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
}
