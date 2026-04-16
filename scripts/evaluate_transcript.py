from __future__ import annotations

import argparse
import re
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

FUNCTION_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "was",
    "we",
    "with",
    "you",
}


def tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9']+", text.lower())


def display_tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9']+|[^\w\s]", text)


def levenshtein_distance(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    current = [0] * (len(right) + 1)
    for left_index, left_char in enumerate(left, start=1):
        current[0] = left_index
        for right_index, right_char in enumerate(right, start=1):
            cost = 0 if left_char == right_char else 1
            current[right_index] = min(
                current[right_index - 1] + 1,
                previous[right_index] + 1,
                previous[right_index - 1] + cost,
            )
        previous, current = current, previous
    return previous[-1]


def classify_errors(reference_tokens: list[str], hypothesis_tokens: list[str]) -> Counter[str]:
    categories: Counter[str] = Counter()
    matcher = SequenceMatcher(a=reference_tokens, b=hypothesis_tokens, autojunk=False)

    for tag, ref_start, ref_end, hyp_start, hyp_end in matcher.get_opcodes():
        if tag == "equal":
            continue

        ref_slice = reference_tokens[ref_start:ref_end]
        hyp_slice = hypothesis_tokens[hyp_start:hyp_end]
        categories["total_edit_blocks"] += 1
        categories[f"{tag}_blocks"] += 1

        if any(token in FUNCTION_WORDS for token in ref_slice + hyp_slice):
            categories["function_word_error_blocks"] += 1

        if any(token[:1].isupper() and token[1:].islower() for token in ref_slice):
            categories["proper_noun_or_capitalized_blocks"] += 1

        if tag == "replace" and len(ref_slice) == len(hyp_slice):
            near_misses = sum(
                1
                for ref_token, hyp_token in zip(ref_slice, hyp_slice)
                if 0 < levenshtein_distance(ref_token.lower(), hyp_token.lower()) <= 2
            )
            if near_misses:
                categories["near_miss_blocks"] += 1

    return categories


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare reference script text with an app transcript.")
    parser.add_argument("reference", type=Path, help="Reference script text file.")
    parser.add_argument("hypothesis", type=Path, help="App transcription text file.")
    parser.add_argument("--examples", type=int, default=12, help="Maximum diff examples to print.")
    args = parser.parse_args()

    reference_text = args.reference.read_text(encoding="utf-8")
    hypothesis_text = args.hypothesis.read_text(encoding="utf-8")
    reference_tokens = tokenize(reference_text)
    hypothesis_tokens = tokenize(hypothesis_text)
    matcher = SequenceMatcher(a=reference_tokens, b=hypothesis_tokens, autojunk=False)
    edit_distance = sum(
        max(ref_end - ref_start, hyp_end - hyp_start)
        for tag, ref_start, ref_end, hyp_start, hyp_end in matcher.get_opcodes()
        if tag != "equal"
    )
    word_error_rate = edit_distance / max(1, len(reference_tokens))
    punctuation_delta = abs(len(display_tokenize(reference_text)) - len(reference_tokens)) - abs(
        len(display_tokenize(hypothesis_text)) - len(hypothesis_tokens)
    )
    categories = classify_errors(reference_text.split(), hypothesis_text.split())

    print(f"reference_words: {len(reference_tokens)}")
    print(f"hypothesis_words: {len(hypothesis_tokens)}")
    print(f"rough_word_error_rate: {word_error_rate:.3f}")
    print(f"punctuation_delta: {punctuation_delta}")
    print("error_categories:")
    for key, value in sorted(categories.items()):
        print(f"  {key}: {value}")

    print("examples:")
    count = 0
    for tag, ref_start, ref_end, hyp_start, hyp_end in matcher.get_opcodes():
        if tag == "equal":
            continue
        ref = " ".join(reference_tokens[ref_start:ref_end])
        hyp = " ".join(hypothesis_tokens[hyp_start:hyp_end])
        print(f"  - {tag}: ref=`{ref}` hyp=`{hyp}`")
        count += 1
        if count >= args.examples:
            break


if __name__ == "__main__":
    main()
