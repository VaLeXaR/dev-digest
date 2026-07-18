import { describeSkill, runSkillCases } from "../../src/index.js";
import { cases } from "./onion-architecture-node.cases.js";

describeSkill("onion-architecture-node", () => runSkillCases("onion-architecture-node", cases));
