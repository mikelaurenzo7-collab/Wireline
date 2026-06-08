import { ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { asStyle } from "@/src/lib/css-style";

export type SentimentSlice = { name: string; value: number; color: string };

type Props = {
  data: SentimentSlice[];
  total: number;
};

export default function OpsSentimentChart({ data, total }: Props) {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
      <div className="w-full sm:w-1/2 h-44 min-h-44 min-w-0 overflow-visible">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Pie
              data={data}
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={5}
              dataKey="value"
              stroke="none"
              isAnimationActive={true}
              animationBegin={200}
              animationDuration={800}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "rgba(28, 25, 23, 0.95)",
                border: "1px solid rgba(139, 63, 214, 0.3)",
                borderRadius: 0,
                boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
              }}
              itemStyle={{ color: "#E0D8CC", fontSize: "11px" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-3">
        {data.map((d) => (
          <div key={d.name} className="flex items-center justify-between group">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={asStyle({ background: d.color })} />
              <span className="text-[11px] font-medium text-muted group-hover:text-ink transition-colors">
                {d.name}
              </span>
            </div>
            <span className="text-[11px] font-mono font-bold text-ink">
              {total > 0 ? `${Math.round((d.value / total) * 100)}%` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
