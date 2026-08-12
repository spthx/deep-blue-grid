import type { Coord } from "./constants.ts";
import type { MissionStageDefinition } from "./Campaign.ts";

const c = (x: number, y: number): Coord => ({ x, y });

/**
 * Candidate operations for the next MISSION expansion.
 *
 * The module is deliberately isolated from Campaign.ts until the library UI,
 * records migration, Unity export, and canonical-route table are updated in one
 * integration change.  Every clue used by the proof routes is present in the
 * brief, plotted contacts, tactical map, or archive log; no route depends on
 * reading enemyPlacements at runtime.
 */
export const ADDITIONAL_STANDARD_MISSIONS: ReadonlyArray<MissionStageDefinition> = [
  {
    id: 23,
    sortOrder: 130,
    difficulty: 3,
    category: "standard",
    title: "DEAD RECKONING",
    subtitle: "二つの推定点を一斉射界へ収め、真の潜航接触を取り逃がすな。",
    directive: "受領した二つの推定点をMK-45 IIの同時射撃へ割り当て、潜水艦を一行動で撃沈せよ。",
    condition: "SS撃沈 / MK-45 II 1回 / 1行動 / 推定点2か所を同時攻撃",
    fleet: ["submarine"],
    playerFleet: ["destroyer"],
    enemyFleet: ["submarine"],
    enemyFirst: false,
    allowedWeapons: ["mk45"],
    objective: {
      kind: "destroy-targets",
      targets: ["submarine"],
      maxFriendlyActions: 1,
      requiredWeaponSequence: ["mk45"],
    },
    playerPlacements: [
      { id: "destroyer", start: c(0, 7), orientation: "east" },
    ],
    enemyPlacements: [
      { id: "submarine", start: c(2, 2), orientation: "east" },
    ],
    enemyDisclosure: {
      known: [],
      unknownCount: 1,
      candidateCells: [
        { code: "TRACK ALPHA / C-3", coord: c(2, 2) },
        { code: "TRACK BRAVO / F-6", coord: c(5, 5) },
      ],
      summary: "二つの推定点は同一接触の競合解。単点射撃による選別は禁止し、同時処理せよ。",
    },
    initialArsenal: { mk45: 1 },
    fixedSeed: 0x6e2303,
    aiSkill: 1.22,
    huntBreadth: 1,
    completion: {
      success: "TRACK RESOLVED：競合する二推定点を一斉射界へ収め、潜航接触を減殺。",
      deadline: "TRACK LOST：推定点の一方を射界外に残し、潜航接触を喪失。",
    },
  },
  {
    id: 24,
    sortOrder: 140,
    difficulty: 4,
    category: "standard",
    title: "LAST SCREEN",
    subtitle: "損傷した航空隊を敵先制射の下で維持し、接近中の巡洋艦を阻止せよ。",
    directive: "敵の先制射を受けたのち、護衛連接を維持したF-4の一出撃で巡洋艦全区画を処理せよ。",
    condition: "CA撃沈 / 敵先攻 / F-4 1回 / CV・DE生存",
    fleet: ["cruiser"],
    playerFleet: ["carrier", "escort"],
    enemyFleet: ["cruiser"],
    enemyFirst: true,
    allowedWeapons: ["phantom"],
    objective: {
      kind: "destroy-targets",
      targets: ["cruiser"],
      maxFriendlyActions: 1,
      protectedShips: ["carrier", "escort"],
      requiredWeaponSequence: ["phantom"],
    },
    playerPlacements: [
      { id: "carrier", start: c(0, 0), orientation: "east" },
      { id: "escort", start: c(4, 0), orientation: "south" },
    ],
    playerInitialHits: [c(0, 0), c(1, 0), c(2, 0), c(0, 1), c(1, 1)],
    enemyPlacements: [
      { id: "cruiser", start: c(2, 4), orientation: "east" },
    ],
    initiallyIdentified: ["cruiser"],
    enemyDisclosure: {
      known: ["cruiser"],
      unknownCount: 0,
      callsigns: { cruiser: "CA-04 BREAKER" },
      candidateCells: [
        { code: "BREAKER / C-5", coord: c(2, 4) },
        { code: "BREAKER / D-5", coord: c(3, 4) },
        { code: "BREAKER / E-5", coord: c(4, 4) },
        { code: "BREAKER / F-5", coord: c(5, 4) },
      ],
      summary: "BREAKERを全区画追尾中。敵初弾後も航空母艦と護衛艦が残存する場合のみ迎撃を継続できる。",
    },
    initialArsenal: { phantom: 1 },
    requiredLink: "carrier",
    fixedSeed: 0x6e2404,
    aiSkill: 1.46,
    huntBreadth: 2,
    completion: {
      success: "SCREEN HELD：損傷下の護衛連接を保持し、接近巡洋艦を航空阻止線内で減殺。",
      deadline: "INTERCEPTION FAILED：航空阻止の機会を逸し、敵巡洋艦の接近を許容。",
      protected: {
        carrier: "FLIGHT OPERATIONS LOST：航空母艦喪失。迎撃作戦を中止。",
        escort: "SCREEN LINK LOST：護衛艦喪失。航空管制連接を維持不能。",
      },
    },
  },
  {
    id: 25,
    sortOrder: 150,
    difficulty: 4,
    category: "standard",
    title: "LINE ABREAST",
    subtitle: "三艦の残存区画が重なる瞬間へ、単一の夾叉斉射を集中せよ。",
    directive: "公開されたBB・DD・DE各一残存区画を、8-INCH STRADDLE一回の射界へ収めて同時撃沈せよ。",
    condition: "BB・DD・DE撃沈 / STRADDLE 1回 / 1行動",
    fleet: ["battleship", "destroyer", "escort"],
    playerFleet: ["cruiser"],
    enemyFleet: ["battleship", "destroyer", "escort"],
    enemyFirst: false,
    allowedWeapons: ["sparrow"],
    objective: {
      kind: "destroy-targets",
      targets: ["battleship", "destroyer", "escort"],
      maxFriendlyActions: 1,
      requiredWeaponSequence: ["sparrow"],
    },
    playerPlacements: [
      { id: "cruiser", start: c(0, 7), orientation: "east" },
    ],
    enemyPlacements: [
      { id: "battleship", start: c(2, 0), orientation: "south" },
      { id: "destroyer", start: c(3, 1), orientation: "south" },
      { id: "escort", start: c(4, 2), orientation: "south" },
    ],
    enemyInitialHits: [
      c(2, 0), c(2, 1), c(2, 2), c(2, 4),
      c(3, 1), c(3, 2),
      c(4, 2),
    ],
    initiallyIdentified: ["battleship", "destroyer", "escort"],
    enemyDisclosure: {
      known: ["battleship", "destroyer", "escort"],
      unknownCount: 0,
      callsigns: {
        battleship: "BB-05 COLUMN",
        destroyer: "DD-03 NEEDLE",
        escort: "DE-01 PICKET",
      },
      candidateCells: [
        { code: "COLUMN / C-4", coord: c(2, 3) },
        { code: "NEEDLE / D-4", coord: c(3, 3) },
        { code: "PICKET / E-4", coord: c(4, 3) },
      ],
      summary: "三接触はいずれも一残存区画。残存線はC-4からE-4へ横一列に収束。",
    },
    initialArsenal: { sparrow: 1 },
    fixedSeed: 0x6e2504,
    aiSkill: 1.52,
    huntBreadth: 1,
    completion: {
      success: "RANGING SOLUTION COMPLETE：単一夾叉で三接触の残存線を同時に減殺。",
      deadline: "RANGING SOLUTION LOST：射界配分を誤り、残存接触を射線外へ残置。",
    },
  },
  {
    id: 26,
    sortOrder: 160,
    difficulty: 5,
    category: "standard",
    title: "CONTROL SWEEP",
    subtitle: "四つの指揮区画推定点を一回の航空掃討で照合し、敵序列を確定せよ。",
    directive: "公開された四つの指揮区画推定点へF-4を同時投入し、CV・BB・CA・DDを一行動で識別せよ。撃沈は要求しない。",
    condition: "CV・BB・CA・DD識別 / F-4 1回 / 1行動",
    fleet: ["carrier", "battleship", "cruiser", "destroyer"],
    playerFleet: ["carrier"],
    enemyFleet: ["carrier", "battleship", "cruiser", "destroyer"],
    enemyFirst: false,
    allowedWeapons: ["phantom"],
    objective: {
      kind: "identify-targets",
      targets: ["carrier", "battleship", "cruiser", "destroyer"],
      maxFriendlyActions: 1,
      requiredWeaponSequence: ["phantom"],
    },
    playerPlacements: [
      { id: "carrier", start: c(0, 6), orientation: "east" },
    ],
    enemyPlacements: [
      { id: "carrier", start: c(0, 0), orientation: "east" },
      { id: "battleship", start: c(0, 3), orientation: "east" },
      { id: "cruiser", start: c(0, 5), orientation: "east" },
      { id: "destroyer", start: c(5, 7), orientation: "east" },
    ],
    enemyDisclosure: {
      known: [],
      unknownCount: 4,
      candidateCells: [
        { code: "AIR CONTROL / C-1", coord: c(2, 0) },
        { code: "MAIN DIRECTOR / C-4", coord: c(2, 3) },
        { code: "PLOT ROOM / C-6", coord: c(2, 5) },
        { code: "LOCAL CONTROL / G-8", coord: c(6, 7) },
      ],
      summary: "四つの指揮区画推定点を相関済み。艦種は重要区画への有効接触時に確定する。",
    },
    // Raw Arsenal counter: 2 yields the carrier's single unescorted sortie.
    initialArsenal: { phantom: 2 },
    fixedSeed: 0x6e2605,
    aiSkill: 1.64,
    huntBreadth: 2,
    completion: {
      success: "ORDER OF BATTLE FIXED：四指揮区画への同時接触から敵艦種序列を確定。",
      deadline: "IDENTIFICATION INCOMPLETE：航空掃討の配分を誤り、未識別接触を残置。",
    },
  },
];

export const ADDITIONAL_ARCHIVE_MISSIONS: ReadonlyArray<MissionStageDefinition> = [
  {
    id: 27,
    sortOrder: 50,
    difficulty: 5,
    category: "archive",
    title: "PRIORITY SIGNAL",
    subtitle: "当直記録から脅威順位と残存区画を復元し、指定順に接触を処理せよ。",
    directive: "日誌と現況図だけを参照し、PICKET、IRONCLAD、ASCENDANTの順に通常砲撃で撃沈せよ。",
    condition: "DE→BB→CV撃沈 / FIRE 3回 / 3行動 / 指定順序厳守",
    fleet: ["carrier", "battleship", "escort"],
    playerFleet: ["battleship"],
    enemyFleet: ["carrier", "battleship", "escort"],
    enemyFirst: false,
    allowedWeapons: ["fire"],
    objective: {
      kind: "destroy-targets",
      targets: ["escort", "battleship", "carrier"],
      maxFriendlyActions: 3,
      requiredDestructionOrder: ["escort", "battleship", "carrier"],
      requiredWeaponUses: { fire: 3 },
    },
    playerPlacements: [
      { id: "battleship", start: c(0, 0), orientation: "east" },
    ],
    enemyPlacements: [
      { id: "escort", start: c(5, 1), orientation: "east" },
      { id: "battleship", start: c(0, 4), orientation: "east" },
      { id: "carrier", start: c(0, 6), orientation: "east" },
    ],
    enemyInitialHits: [
      c(5, 1),
      c(0, 4), c(1, 4), c(2, 4), c(4, 4),
      c(0, 6), c(2, 6), c(3, 6), c(0, 7), c(1, 7), c(2, 7), c(3, 7),
    ],
    initiallyIdentified: ["escort", "battleship", "carrier"],
    enemyDisclosure: {
      known: ["escort", "battleship", "carrier"],
      unknownCount: 0,
      callsigns: {
        escort: "DE-01 PICKET",
        battleship: "BB-05 IRONCLAD",
        carrier: "CV-08 ASCENDANT",
      },
      candidateCells: [
        { code: "PICKET / G-2", coord: c(6, 1) },
        { code: "IRONCLAD / D-5", coord: c(3, 4) },
        { code: "ASCENDANT / B-7", coord: c(1, 6) },
      ],
      summary: "各艦は一残存区画。攻撃順は最新の脅威優先信号に従う。",
    },
    archiveLog: [
      { time: "0740Z", text: "損害管制報告。三接触はいずれも残存一区画。", tone: "warning" },
      { time: "0742Z", text: "DE-01 PICKET最終区画をG-2に固定。近接警戒能力は残存。", tone: "critical" },
      { time: "0744Z", text: "BB-05 IRONCLAD主砲指揮所をD-5に固定。", tone: "warning" },
      { time: "0746Z", text: "CV-08 ASCENDANT飛行管制区画をB-7に固定。", tone: "warning" },
      { time: "0748Z", text: "FLASH PRIORITY：PICKET、IRONCLAD、ASCENDANTの順に処理。", tone: "critical" },
    ],
    fixedSeed: 0x6e2705,
    aiSkill: 1.72,
    huntBreadth: 2,
    completion: {
      success: "PRIORITY EXECUTED：当直記録どおりの脅威順で三接触を処理。",
      deadline: "PRIORITY VIOLATION：指定された脅威順位または残存区画を誤認。",
    },
  },
];

export const ADDITIONAL_EXTREME_MISSIONS: ReadonlyArray<MissionStageDefinition> = [
  {
    id: 28,
    sortOrder: 70,
    difficulty: 6,
    category: "extreme",
    title: "SENSOR TO SHOOTER",
    subtitle: "音響接触を射撃解へ引き渡し、交差する二目標を一斉射で処理せよ。",
    directive: "指定海面ALPHAへSONARを実施し、CONTACT確認後にHARPOON一斉射でDD・SSを同時撃沈せよ。",
    condition: "ALPHA CONTACT→HARPOON / DD・SS撃沈 / 2行動",
    fleet: ["destroyer", "submarine"],
    playerFleet: ["battleship", "submarine"],
    enemyFleet: ["destroyer", "submarine"],
    enemyFirst: false,
    allowedWeapons: ["radar", "harpoon"],
    objective: {
      kind: "scan-and-destroy",
      targets: ["destroyer", "submarine"],
      maxFriendlyActions: 2,
      reports: [
        { origin: c(2, 2), contact: true, code: "ALPHA / C-3:D-4" },
      ],
      orderedReports: true,
      requiredWeaponSequence: ["radar", "harpoon"],
    },
    playerPlacements: [
      { id: "battleship", start: c(0, 7), orientation: "east" },
      { id: "submarine", start: c(7, 0), orientation: "east" },
    ],
    enemyPlacements: [
      { id: "destroyer", start: c(0, 2), orientation: "east" },
      { id: "submarine", start: c(4, 4), orientation: "east" },
    ],
    enemyInitialHits: [c(0, 2), c(1, 2)],
    initiallyIdentified: ["destroyer"],
    enemyDisclosure: {
      known: ["destroyer"],
      unknownCount: 1,
      callsigns: { destroyer: "DD-03 VECTOR" },
      candidateCells: [
        { code: "VECTOR LAST SECTION / C-3", coord: c(2, 2) },
        { code: "SUBMERGED FIX / E-5", coord: c(4, 4) },
        { code: "FIRING CENTER / D-4", coord: c(3, 3) },
      ],
      summary: "DD残存区画と潜航推定点は同一HARPOON交差射界内。射撃承認はALPHAのCONTACT確認後。",
    },
    // Raw counter 2 leaves one of the battleship's two unlinked salvos.
    initialArsenal: { radar: 1, harpoon: 2 },
    fixedSeed: 0x6e2806,
    aiSkill: 1.96,
    huntBreadth: 2,
    completion: {
      success: "KILL CHAIN COMPLETE：音響接触を射撃解へ引き渡し、二接触を同一斉射で減殺。",
      deadline: "KILL CHAIN BROKEN：探知・射撃の引き渡し順序を逸脱し、接触を残置。",
    },
  },
];

export const ADDITIONAL_MISSIONS: ReadonlyArray<MissionStageDefinition> = [
  ...ADDITIONAL_STANDARD_MISSIONS,
  ...ADDITIONAL_ARCHIVE_MISSIONS,
  ...ADDITIONAL_EXTREME_MISSIONS,
];
