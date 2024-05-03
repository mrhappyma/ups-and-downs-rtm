# Ups & Downs RTM

same old up vs down game, shiny new bot, ironically built on the old [_legacy real time messaging API_](https://api.slack.com/legacy/rtm)

##

a simple little game in the [Hack Club Slack](https://hackclub.com/slack/), called up vs down. everyone is divided up in team up or down, team up counts up to 100, team down counts down to -100, and messing up or counting twice gets the count moved 5 points in the other team's direction. this bot wrangles that.

the [original bot](https://github.com/mrhappyma/slack-ups-and-downs) was quite slow at processing counts and occasionally did so out of order, which caused some obvious problems with several people counting quickly. this is a rewrite using the real time messaging API, which despite being deprecated, is much more reliable at this.
