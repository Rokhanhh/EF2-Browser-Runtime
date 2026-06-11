import { installObjectPropertyCandidateDetector } from "../property-detector.js";

export function installWaveCandidateDetector(onCandidate) {
    return installObjectPropertyCandidateDetector(["currentWave", "waveStartTime"], onCandidate);
}
