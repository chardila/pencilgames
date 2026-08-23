# Box-Making

## Status
Family of pencil-and-paper games related to Dots and Boxes.

## Core concept
Players add lines to a grid or graph and score when their move completes a box/region.

## Recommended implementation
Use the Dots and Boxes engine and expose the box definition as configuration.

## Turn
1. Draw one unused legal edge.
2. Detect newly completed boxes.
3. Award points.
4. Grant another turn if the selected ruleset says completed boxes grant another move.

## Warning
“Box-making” is not a single universally standardized ruleset. Do not present this file as a canonical historical ruleset without selecting a specific source.
