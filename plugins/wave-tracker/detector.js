import { installObjectPropertyCandidateDetector } from "/endlessfrontier2/bootstrap/runtime/property-detector.js";

export function installWaveCandidateDetector(onCandidate) {
    return installObjectPropertyCandidateDetector(["currentWave", "waveStartTime"], onCandidate);
}
