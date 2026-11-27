import json
from pathlib import Path

from car_glass import glass_features
from car_lights import light_features
from car_trim import trim_features
from car_wheels import wheel_features

MIN_FEATURE_METRES = 0.012
FEATURE_DECIMALS = 5


def feature_list(strokes: dict[str, float]) -> list[dict[str, float | str]]:
    entries = wheel_features() + trim_features() + light_features() + glass_features() + list(strokes.items())
    return [{"name": name, "minWidthMetres": round(width, FEATURE_DECIMALS)} for name, width in entries]


def thin_features(features: list[dict[str, float | str]]) -> list[str]:
    return [f"{item['name']}={item['minWidthMetres']}" for item in features if float(item["minWidthMetres"]) < MIN_FEATURE_METRES]


def write_features(path: Path, strokes: dict[str, float]) -> list[dict[str, float | str]]:
    features = feature_list(strokes)
    thin = thin_features(features)
    if thin:
        raise RuntimeError("FEATURE too thin: " + ", ".join(thin))
    path.write_text(json.dumps(features, indent=2) + "\n")
    return features
