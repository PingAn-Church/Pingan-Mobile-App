# Spiritual Gift Assessment Content Notes

## Source and scope

The in-app assessment is based on the supplied C. Peter Wagner material in
`DiscoverYourSpiritualGifts.docx`. The source contains 25 gift definitions and
125 questions. Five interleaved questions contribute to each gift, and each
answer is worth 0-3 points, so every gift has a maximum score of 15.

The app preserves the source question order and scoring map. Chinese text was
normalized to simplified Chinese punctuation and lightly edited for clear,
current wording. English text is a faithful in-app translation, not a separate
English edition of the source document.

## Display-name normalization

| Source wording | In-app Chinese | In-app English |
| --- | --- | --- |
| 牧者 / 牧师 | 牧养 | Pastoring |
| 劝化 | 劝勉 | Exhortation |
| 帮助人的 | 帮助 | Helps |
| 怜悯人的 | 怜悯 | Mercy |
| 宣道，宣教士 | 宣教 | Missionary |
| 传福音的 | 传福音 | Evangelism |
| 款待或招待人的 | 接待 | Hospitality |
| 领袖（治理） | 领导 | Leadership |
| 治理（行政） | 治理 | Administration |
| 神迹或异能 | 神迹 | Miracles |
| 医病 | 医治 | Healing |
| 服务（包括执事） | 服事 | Service |

## Confirmed corrections

- Teaching reference: `罗12:71` was corrected to `罗12:7`.
- Voluntary Poverty reference: `林6:10` was corrected to `林后6:10`.
- Healing definition: `医治疾治` was corrected to `医治疾病`.
- Tongues definition: `已他们本身` was corrected to `以他们本身`.
- Service definition: `支源` was corrected to `资源`.
- Obvious spacing, punctuation, duplicated words, and simplified/traditional
  Chinese inconsistencies were normalized without changing the scoring order.

## Persistence contract

- Guest results are local cache data and are removed by Storage > Clear cache.
- A signed-in user has one row in `spiritual_gift_results`.
- The client sends answers only for scoring. The backend stores only the 25
  totals, assessment version, and completion time.
- A retake updates the same row; no attempt history or individual answers are
  retained.
