import { randomInt } from 'node:crypto'

// The vault: a dice table where you can walk out richer or poorer. The roll happens
// here on the server; the client only ever shows the number it is told about, so the
// odds cannot be bent from the browser.
//
// Every risk level keeps a house edge — the payout is always a little under the fair
// price of the chance — which is what stops coins from multiplying forever.

export const MIN_BET = 10
export const MAX_BET = 250_000

export const RISKS = [
  { key: 'steady', label: 'Steady', chance: 75, multiplier: 1.25 },
  { key: 'even', label: 'Even', chance: 50, multiplier: 1.9 },
  { key: 'bold', label: 'Bold', chance: 25, multiplier: 3.6 },
  { key: 'royal', label: 'Royal', chance: 10, multiplier: 8.5 },
]

export const RISK_KEYS = new Set(RISKS.map(risk => risk.key))

export const riskByKey = key => RISKS.find(risk => risk.key === key) ?? null

/** A d100: the roll is a whole number 1-100 and wins when it is inside the chance. */
export function rollDice(chance) {
  const roll = randomInt(1, 101)
  return { roll, won: roll <= chance }
}

export const payoutFor = (risk, wager) => Math.floor(wager * risk.multiplier)
