import "server-only"

import * as tf from "@tensorflow/tfjs"
import * as nsfwjs from "nsfwjs"
import sharp from "sharp"

import { MODERATION_CLASSES, type ModerationScores } from "@/lib/moderation/policy"

/**
 * Bildklassning på servern (v29) med nsfwjs (MobileNetV2, ingår i paketet).
 * Allt körs i vår egen serverfunktion – bilderna skickas aldrig till någon
 * tredje part (GDPR). Modellen laddas en gång per serverinstans (~1 s) och en
 * klassning tar ~1 s på CPU.
 */
let model: Promise<nsfwjs.NSFWJS> | null = null

function loadModel() {
  if (!model) {
    model = (async () => {
      await tf.setBackend("cpu")
      tf.enableProdMode()
      return nsfwjs.load("MobileNetV2")
    })()
    model.catch(() => (model = null))
  }
  return model
}

/** Bildformat som går att granska (läses med sharp). */
export const IMAGE_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif", "tiff"])

export async function classifyImage(input: Buffer): Promise<ModerationScores> {
  const m = await loadModel()
  // 224 × 224 RGB – modellens indata. Första bildrutan för animerade GIF:ar.
  const { data, info } = await sharp(input, { animated: false }).rotate().resize(224, 224, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const tensor = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], "int32")
  try {
    const predictions = await m.classify(tensor, MODERATION_CLASSES.length)
    const scores = Object.fromEntries(MODERATION_CLASSES.map((c) => [c, 0])) as ModerationScores
    for (const p of predictions) scores[p.className as keyof ModerationScores] = p.probability
    return scores
  } finally {
    tensor.dispose()
  }
}
