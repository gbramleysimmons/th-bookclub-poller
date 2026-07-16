"""Borda count scoring for ranked-choice ballots."""
from typing import Dict, List


def borda_scores(options: List[str], ballots: List[List[int]]) -> List[dict]:
    """Compute Borda count scores.

    Args:
        options: list of option labels.
        ballots: list of ballots. Each ballot is an ordered list of option
            indices, most-preferred first. Ballots may be partial; unranked
            options receive 0 points from that ballot.

    Returns:
        List of dicts ``{option, index, points, votes}`` sorted by points
        (descending), then by option order for stable tie-breaking.
    """
    n = len(options)
    points: Dict[int, int] = {i: 0 for i in range(n)}
    first_place: Dict[int, int] = {i: 0 for i in range(n)}

    for ballot in ballots:
        seen = set()
        for position, option_index in enumerate(ballot):
            if option_index in seen or not (0 <= option_index < n):
                continue
            seen.add(option_index)
            # Standard Borda: position 0 (first) gets n-1 points, last gets 0.
            points[option_index] += (n - 1 - position)
            if position == 0:
                first_place[option_index] += 1

    results = [
        {
            "option": options[i],
            "index": i,
            "points": points[i],
            "firstPlaceVotes": first_place[i],
        }
        for i in range(n)
    ]
    results.sort(key=lambda r: (-r["points"], r["index"]))
    return results
