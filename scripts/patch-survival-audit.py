from __future__ import annotations

from pathlib import Path

PATH = Path("scripts/survival-composition-audit.ts")

SMART_FUNCTION = '''function decidePlayerAction(
  ai: EnemyAI,
  ownBoard: Board,
  targetBoard: Board,
  insight: number,
  rng: SeededRandom,
): AIDecision {
  const normal = ai.decide(ownBoard);
  if (normal.weapon !== "fire") return normal;
  if (rng.next() < insight) {
    const damaged = targetBoard.ships
      .filter((ship) => !ship.sunk && ship.hits.size > 0)
      .flatMap((ship) => ship.cells.filter((cell) => !ship.hits.has(`${cell.x},${cell.y}`)));
    const live = targetBoard.ships
      .filter((ship) => !ship.sunk)
      .flatMap((ship) => ship.cells.filter((cell) => !ship.hits.has(`${cell.x},${cell.y}`)));
    const candidates = damaged.length ? damaged : live;
    if (candidates.length) {
      return {
        weapon: "fire",
        targets: [{ ...rng.pick(candidates) }],
        state: damaged.length ? "TARGET" : "SEARCH",
      };
    }
  }
  return normal;
}
'''.splitlines()


def main() -> None:
    text = PATH.read_text(encoding="utf-8")
    replacements = {
        "const SCREEN_TRIALS = Math.max(80, Number(process.env.SURVIVAL_SCREEN_TRIALS ?? 220));":
            "const SCREEN_TRIALS = Math.max(20, Number(process.env.SURVIVAL_SCREEN_TRIALS ?? 20));",
        "const CALIBRATION_TRIALS = Math.max(80, Number(process.env.SURVIVAL_CALIBRATION_TRIALS ?? 220));":
            "const CALIBRATION_TRIALS = Math.max(20, Number(process.env.SURVIVAL_CALIBRATION_TRIALS ?? 30));",
        "const FINAL_TRIALS = Math.max(500, Number(process.env.SURVIVAL_FINAL_TRIALS ?? 3000));":
            "const FINAL_TRIALS = Math.max(150, Number(process.env.SURVIVAL_FINAL_TRIALS ?? 200));",
        "const FINALIST_COUNT = Math.max(4, Number(process.env.SURVIVAL_FINALIST_COUNT ?? 6));":
            "const FINALIST_COUNT = Math.max(3, Number(process.env.SURVIVAL_FINALIST_COUNT ?? 5));",
        "const PLAYER_SKILLS = [1.35, 1.55, 1.75, 1.95, 2.15, 2.35, 2.55, 2.75, 2.95];":
            "const PLAYER_SKILLS = [0.10, 0.18, 0.26, 0.34, 0.42, 0.50, 0.58, 0.66, 0.74, 0.82, 0.90, 0.98];",
    }
    for old, new in replacements.items():
        if old not in text:
            raise SystemExit(f"required source line missing: {old}")
        text = text.replace(old, new, 1)

    text = text.replace("playerSkill", "playerInsight")
    text = text.replace(
        "|AI skill|3回再挑戦込み|一発通し|第6面到達|",
        "|推理補正率|3回再挑戦込み|一発通し|第6面到達|",
    )
    text = text.replace("採用 skill:", "採用推理補正率:")
    text = text.replace("`${row.skill.toFixed(2)}", "`${percent(row.skill)}")
    text = text.replace("${report.selectedSkill.toFixed(2)}", "${percent(report.selectedSkill)}")
    text = text.replace("## 3000回最終比較", "## 最終候補比較")
    text = text.replace("同一3000シードにおける候補間", "同一シードにおける候補間")
    text = text.replace(
        "- プレイヤー代理は毎面、空母・戦艦・護衛艦のDUAL SUPPORT LINKが成立する4種類の回転配置を使い、実装のEnemyAIを熟練側へ校正しています。",
        "- プレイヤー代理は毎面、DUAL SUPPORT LINKが成立する4種類の回転配置を使います。推理補正率は、人間がECHO・既命中位置・艦形から正解区画へ絞る強さを確率化したものです。",
    )

    source = text.splitlines()
    output: list[str] = []
    inserted_smart = False
    in_player_ctor = False
    replaced_ctor_value = False
    inserted_insight_rng = False
    replaced_decision = False
    replaced_manual_ids = False
    skip_manual_ids = 0

    for line in source:
        stripped = line.strip()

        if skip_manual_ids:
            skip_manual_ids -= 1
            continue

        if stripped == "function battle(args: {" and not inserted_smart:
            output.extend(SMART_FUNCTION)
            output.append("")
            inserted_smart = True

        if stripped == "const playerAi = new EnemyAI(":
            in_player_ctor = True

        if in_player_ctor and stripped == "playerInsight," and not replaced_ctor_value:
            output.append("    1.55,")
            replaced_ctor_value = True
            continue

        if in_player_ctor and stripped == ");":
            output.append(line)
            output.append("  const insightRng = new SeededRandom(seed ^ 0xa4093822);")
            in_player_ctor = False
            inserted_insight_rng = True
            continue

        if "decision: playerAi.decide(playerBoard)," in line and not replaced_decision:
            indent = line[: len(line) - len(line.lstrip())]
            output.extend([
                f"{indent}decision: decidePlayerAction(",
                f"{indent}  playerAi,",
                f"{indent}  playerBoard,",
                f"{indent}  enemyBoard,",
                f"{indent}  playerInsight,",
                f"{indent}  insightRng,",
                f"{indent}),",
            ])
            replaced_decision = True
            continue

        if stripped == '"s6-remove-escort",' and not replaced_manual_ids:
            indent = line[: len(line) - len(line.lstrip())]
            for candidate_id in [
                "s2-remove-escort",
                "s3-remove-escort",
                "s4-remove-escort",
                "s4-remove-submarine",
                "s6-remove-escort",
                "s6-remove-submarine",
            ]:
                output.append(f'{indent}"{candidate_id}",')
            skip_manual_ids = 2
            replaced_manual_ids = True
            continue

        output.append(line)

    missing = [
        name
        for name, ok in {
            "smart decision function": inserted_smart,
            "fixed player AI skill": replaced_ctor_value,
            "insight RNG": inserted_insight_rng,
            "player decision call": replaced_decision,
            "manual finalist list": replaced_manual_ids,
        }.items()
        if not ok
    ]
    if missing:
        raise SystemExit("patch incomplete: " + ", ".join(missing))

    PATH.write_text("\n".join(output) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
