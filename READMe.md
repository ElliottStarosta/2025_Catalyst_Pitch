# Adjustment Factor & Compatibility Prediction – Math & Reasoning

This document explains the mathematical foundation for the following components:

1. **Adjustment Factor**: Personality alignment on introvert-extrovert scale
2. **Predicted Score**: How a user might rate an experience based on similarity to another user's rating
3. **Confidence Factor**: Weighting reliability of prediction
4. **Environmental Estimates**: How crowd size, noise level, and social intensity are calculated

---

## 1. Adjustment Factor Calculation

### Purpose:

Quantify a user's personality on a scale from **−1 (introvert)** to **+1 (extrovert)** using weighted questionnaire responses.

### Formula:

Let $R_i \in \{1,2,3,4,5\}$ be the user's response to question $i$, and $W_i$ the corresponding weight. For reverse-scored questions:

$$
R_i^{adj} = 6 - R_i
$$

### Why 6?

The responses range from 1 (Strongly Disagree) to 5 (Strongly Agree). Reversing a score flips the direction of agreement, so we subtract the value from 6:

* $6 - 1 = 5$ (strongly agree after reversing)
* $6 - 5 = 1$ (strongly disagree after reversing)

This ensures all items contribute in the same direction when scoring (higher means more extroverted).

### Weighted Average:

$$
\text{Weighted Score} = \frac{\sum_{i=1}^n R_i^{adj} \cdot W_i}{\sum_{i=1}^n W_i}
$$

### Normalize:

$$
\text{Adjustment Factor} = \frac{\text{Weighted Score} - 2.5}{2.5} \in [-1, 1]
$$

### Why 2.5?

Because it's the midpoint of a 1–5 Likert scale. Values above 2.5 indicate extroversion, below indicate introversion.

---

## 2. Prediction Score Calculation

We use another user's rating to estimate how a different user would rate the same experience, based on their personality difference.

### Formula:

Let:

* $AF_{user}$: Adjustment factor of target user
* $AF_{rater}$: Adjustment factor of original reviewer
* $D = |AF_{user} - AF_{rater}|$: Personality difference
* $S \in [1,10]$: Social intensity of the experience
* $R \in [1,10]$: Original rating
* $\alpha = 0.2$: Intensity adjustment multiplier

Then:

$$
\text{Prediction} =
\begin{cases}
R + D \cdot S \cdot \alpha & \text{if } AF_{rater} < AF_{user} \\
R - D \cdot S \cdot \alpha & \text{if } AF_{rater} > AF_{user}
\end{cases}
$$

### Bounding:

$$
\text{Prediction} = \min(10, \max(1, \text{Prediction}))
$$

### Rationale:

* If the rater is **more introverted**, and the user is **more extroverted**, the user may enjoy the social experience **more**, so we **increase** the rating.
* If the rater is **more extroverted**, but the user is **more introverted**, we **decrease** the rating.

The product $D \cdot S \cdot \alpha$ scales the adjustment by personality gap and social exposure.

---

## 3. Confidence Factor

This determines how much trust to place in a prediction.

### Formula:

$$
\text{Confidence} = \max\left(0.1, 1 - \frac{D}{2}\right)
$$

* $D = |AF_{user} - AF_{rater}| \in [0, 2]$
* Confidence declines linearly with increasing personality difference.
* Capped at **0.1** to avoid zero trust.

### Why divide by 2?

The total possible personality difference is 2 (from -1 to +1). Dividing by 2 maps the range of differences to the 0–1 confidence loss scale. This gives:

* Perfect match ($D = 0$) → Confidence = 1
* Total mismatch ($D = 2$) → Confidence = 0.1 (minimum allowed)

---

## 4. Environmental Estimates (Crowd, Noise, Social Intensity)

We estimate environment stats based on **activity category** + **user responses**.

Let:

* $B$: Baseline value for the category
* $X$: Dynamic adjustment based on user ratings

---

### 4.1. Social Intensity

Based on user response to social satisfaction:

$$
\text{Social Intensity} = \min(10, \max(1, B + 0.5 \cdot (S - 5)))
$$

* $S$: Social satisfaction rating (1–10)
* $0.5$: Sensitivity to social rating

### Why 0.5?

Social satisfaction directly reflects how socially engaging the environment was. The multiplier of 0.5 ensures that even large deviations (±5) only shift the base intensity by ±2.5, keeping scores realistic.

---

### 4.2. Noise Level

Based on overwhelm rating:

$$
\text{Noise Level} = \min(10, \max(1, B + 0.3 \cdot (O - 5)))
$$

* $O$: Overwhelm rating (1–10)
* $0.3$: Weight on perceived noise from overwhelm

### Why 0.3?

Overwhelm often includes noise sensitivity but isn't exclusively about sound. Using a 0.3 multiplier gives moderate influence without over-attributing all overwhelm to volume.

---

### 4.3. Crowd Size

Combines overwhelm and comfort:

$$
\text{Crowd Size} = \min(10, \max(1, B + 0.2 \cdot (O - 5) + 0.1 \cdot (5 - C)))
$$

* $O$: Overwhelm rating (1–10)
* $C$: Comfort rating (1–10)
* $0.2$: Crowd impact from overwhelm
* $0.1$: Crowd impact from reduced comfort

### Why 0.2 and 0.1?

Overwhelm is a strong (but not exclusive) proxy for crowd perception. Comfort inversely indicates space or density. Their weights reflect that crowd size is influenced by both, but mostly by overwhelm.

---

## Summary of Constants

| Constant  | Value     | Use                                 | Reasoning                                           |
| --------- | --------- | ----------------------------------- | --------------------------------------------------- |
| 2.5       | 2.5       | Normalize 1–5 scale to \[−1,1]      | 2.5 = midpoint of Likert scale                      |
| 6         | 6         | Reverse scoring (6 - R)             | Flips 1–5 scale symmetrically                       |
| $\alpha$  | 0.2       | Scale effect of social exposure     | Keeps prediction changes bounded ($\leq 2$)         |
| 0.1       | 0.1       | Min confidence                      | Avoid zero weighting                                |
| 0.5       | 0.5       | Social intensity sensitivity        | Moderate influence from social satisfaction         |
| 0.3       | 0.3       | Noise level weight                  | Reflects partial mapping of overwhelm to noise      |
| 0.2 / 0.1 | 0.2 & 0.1 | Crowd size from overwhelm & comfort | Overwhelm dominates crowd feel, comfort adds nuance |
