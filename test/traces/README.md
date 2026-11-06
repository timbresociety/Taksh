# Landmark traces

Pose landmarks produced by MediaPipe in Chrome, saved from the input lab. No video is stored here, and nothing recorded from a real player: those traces stay on the machine that made them.

| Trace | Source footage | Licence |
| --- | --- | --- |
| `real-burpees-and-jacks` | [Jumping jacks and burpees](https://commons.wikimedia.org/wiki/File:Jumping_jacks_and_burpees.webm) by Taco fleur, cropped to 16:9 | CC BY-SA 4.0 |
| `real-burpee-second-person` | [Burpee How To](https://commons.wikimedia.org/wiki/File:Burpee_How_To.webm) by Gyglim and Mmeng19901001, first six seconds | CC BY-SA 3.0 |
| `real-jacks-with-depth` | The same clip as `real-burpees-and-jacks`, played through a fake camera into the input lab, with MediaPipe's metric depth as the fifth value of each landmark | CC BY-SA 4.0 |
| `panned-steps-and-jumps` | A still from the first clip, panned by ffmpeg to imitate steps and jumps. The pixels are real; the motion is not. | CC BY-SA 4.0 |

These landmarks derive from share-alike footage, so check that fits before shipping them in anything other than this test folder.
