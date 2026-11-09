import { SAMPLE_SERMON_IDS } from "./sample";
import type { LegacyPoint, Sermon } from "./types";

const pts = (rows: [string, string, string][]): LegacyPoint[] =>
  rows.map(([before, answer, after]) => ({ before, answer, after }));

/**
 * Sample outlines for the preview. Speaker is “Pastor” on every record.
 * These are not recordings of Restoration Fellowship services.
 * Scripture is a reference only — the passage itself is read on Bible Gateway.
 */
const SEED: Sermon[] = [
  {
    id: "roof-opened",
    title: "When the Roof Opened",
    date: "2026-11-01",
    speaker: "Pastor",
    scripture: "Mark 2:1–12",
    reference: "Mark 2:1-12",
    cover: "/covers/01-roof.jpg",
    status: "published",
    context:
      "A crowded house in Capernaum left no way through the door, so four friends opened the roof and lowered a paralyzed man to Jesus.",
    lead: "Faith that helps someone reach Jesus",
    points: pts([
      ["begins with ", "concern", " for someone who cannot get there alone."],
      ["works through ", "cooperation", ", not a single hero."],
      ["trusts that ", "Jesus", " is the one who can make the person well."],
      ["keeps ", "priorities", " straight when the path is inconvenient."],
    ]),
  },
  {
    id: "hem",
    title: "The Hem of His Garment",
    date: "2026-10-25",
    speaker: "Pastor",
    scripture: "Mark 5:25–34",
    reference: "Mark 5:25-34",
    cover: "/covers/02-garment.jpg",
    status: "published",
    context:
      "After twelve years of illness and spent resources, a woman reached for Jesus in a pressing crowd.",
    lead: "This account shows that",
    points: pts([
      ["need can become a kind of ", "desperation", " that finally turns toward Jesus."],
      ["faith still has to ", "reach", " — even if the gesture is small."],
      ["Jesus does not only notice the crowd; He notices the ", "person", "."],
      ["healing is followed by a word of ", "peace", "."],
    ]),
  },
  {
    id: "what-do-you-want",
    title: "What Do You Want Me to Do?",
    date: "2026-10-18",
    speaker: "Pastor",
    scripture: "Mark 10:46–52",
    reference: "Mark 10:46-52",
    cover: "/covers/03-road-dawn.jpg",
    status: "published",
    context:
      "Bartimaeus sat by the road outside Jericho and would not be silenced when Jesus passed by.",
    lead: "A clear cry to Jesus",
    points: pts([
      ["refuses to let the ", "crowd", " decide whether you may speak."],
      ["asks for ", "mercy", " before it asks for a plan."],
      ["names the real need: ", "sight", "."],
      ["ends by ", "following", " Jesus on the way."],
    ]),
  },
  {
    id: "be-still",
    title: "Peace, Be Still",
    date: "2026-10-11",
    speaker: "Pastor",
    scripture: "Mark 4:35–41",
    reference: "Mark 4:35-41",
    cover: "/covers/04-still-water.jpg",
    status: "published",
    context:
      "The disciples were experienced on the water, yet a sudden storm left them convinced they were perishing — while Jesus slept in the boat.",
    lead: "When the storm is real",
    points: pts([
      ["remember that Jesus is in the ", "boat", " with His people."],
      ["His word can speak ", "peace", " over what we cannot manage."],
      ["fear is answered not by denial, but by ", "faith", "."],
    ]),
  },
  {
    id: "enough",
    title: "Enough for Everyone",
    date: "2026-10-04",
    speaker: "Pastor",
    scripture: "John 6:1–13",
    reference: "John 6:1-13",
    cover: "/covers/05-loaves.jpg",
    status: "published",
    context:
      "A large crowd had no food. A boy’s lunch looked like nothing — until it was placed in Jesus’ hands.",
    lead: "God’s provision often begins",
    points: pts([
      ["with what looks like a ", "small offering", "."],
      ["when it is ", "given", " rather than held back."],
      ["and it proves to be ", "enough", " — with baskets left over."],
    ]),
  },
  {
    id: "come-and-see",
    title: "Come and See",
    date: "2026-09-27",
    speaker: "Pastor",
    scripture: "John 1:35–46",
    reference: "John 1:35-46",
    cover: "/covers/06-doorway.jpg",
    status: "published",
    context:
      "The first disciples did not begin with a full explanation. They were invited to come and see where Jesus was staying.",
    lead: "Invitation is part of discipleship",
    points: pts([
      ["because people often need a ", "personal welcome", " more than an argument."],
      ["and the next step can be as simple as ", "come and see", "."],
      ["Then one person goes and finds ", "another", "."],
    ]),
  },
  {
    id: "better-portion",
    title: "The Better Portion",
    date: "2026-09-20",
    speaker: "Pastor",
    scripture: "Luke 10:38–42",
    reference: "Luke 10:38-42",
    cover: "/covers/07-table.jpg",
    status: "published",
    context:
      "Martha opened her home. Mary sat and listened. Jesus honored service — and still named the one necessary thing.",
    lead: "In a busy house of ministry",
    points: pts([
      ["hospitality matters, but it can become ", "distraction", "."],
      ["the better portion is to ", "listen", " to Jesus."],
      ["and that choice will not be ", "taken away", "."],
    ]),
  },
  {
    id: "road-home",
    title: "The Road Home",
    date: "2026-09-13",
    speaker: "Pastor",
    scripture: "Luke 15:11–24",
    reference: "Luke 15:11-24",
    cover: "/covers/08-road-home.jpg",
    status: "published",
    context:
      "A younger son wasted what he had been given and came to himself far from home. The father was already watching the road.",
    lead: "This parable tells us that",
    points: pts([
      ["we can leave, but we do not stop being a ", "child", "."],
      ["repentance includes getting up and going ", "home", "."],
      ["the Father runs to meet us with ", "mercy", ", not a lecture."],
    ]),
  },
  {
    id: "take-heart",
    title: "Take Heart",
    date: "2026-09-06",
    speaker: "Pastor",
    scripture: "Matthew 14:22–33",
    reference: "Matthew 14:22-33",
    cover: "/covers/09-water-path.jpg",
    status: "published",
    context:
      "The disciples strained against the wind until Jesus came to them on the water and called Peter to come.",
    lead: "Courage in the wind",
    points: pts([
      ["starts by recognizing Jesus and hearing ", "take heart", "."],
      ["steps out only at His ", "word", "."],
      ["and when fear rises, the answer is to cry ", "Lord, save me", "."],
    ]),
  },
  {
    id: "living-stones",
    title: "Living Stones",
    date: "2026-08-30",
    speaker: "Pastor",
    scripture: "1 Peter 2:4–10",
    reference: "1 Peter 2:4-10",
    cover: "/covers/10-stones.jpg",
    status: "published",
    context:
      "Peter describes the church not as a crowd of spectators, but as a spiritual house built on Christ.",
    lead: "In Christ we are being built",
    points: pts([
      ["as ", "living stones", " into a spiritual house."],
      ["with Jesus as the ", "cornerstone", "."],
      ["so that we may ", "proclaim", " the mercy that called us out of darkness."],
    ]),
  },
];

/** Fresh copies so a caller cannot mutate the seed catalog. */
export function demoSermons(): Sermon[] {
  return SEED.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ ...p })),
  }));
}
