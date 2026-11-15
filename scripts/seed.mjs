import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Admin user...");
  const adminEmail = process.env.ADMIN_EMAIL || "vubadong071102@gmail.com";
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "0711Vubadong02@";

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {
      password: hashedPassword,
      username: adminUsername,
    },
    create: {
      email: adminEmail,
      username: adminUsername,
      password: hashedPassword,
    },
  });
  console.log("Admin user seeded:", admin.email);

  // Thử trích xuất link X của người dùng:
  const testUrl = "https://x.com/cecksatuduatiga/status/2121874046459822252/photo/1";
  console.log("Testing extraction for:", testUrl);

  try {
    const res = await fetch("https://api.vxtwitter.com/cecksatuduatiga/status/2121874046459822252");
    if (res.ok) {
      const data = await res.json();
      console.log("Parsed vxTwitter data:", {
        mediaURLs: data.mediaURLs,
        media_extended: data.media_extended,
        text: data.text,
      });

      if (data.mediaURLs && data.mediaURLs.length > 0) {
        for (let i = 0; i < data.mediaURLs.length; i++) {
          const mUrl = data.mediaURLs[i];
          const isVideo = mUrl.includes(".mp4") || mUrl.includes("video.twimg.com");

          const mediaItem = await prisma.mediaItem.create({
            data: {
              type: isVideo ? "VIDEO" : "IMAGE",
              sourceType: "X_TWITTER",
              sourceUrl: testUrl,
              storageMode: "DIRECT_LINK",
              mediaUrl: mUrl,
              thumbnailUrl: mUrl,
              title: data.text || `X Photo ${i + 1}`,
              tags: {
                create: [
                  {
                    tag: {
                      connectOrCreate: {
                        where: { slug: "x-twitter" },
                        create: { name: "X_Twitter", slug: "x-twitter" },
                      },
                    },
                  },
                  {
                    tag: {
                      connectOrCreate: {
                        where: { slug: "cecksatuduatiga" },
                        create: { name: "cecksatuduatiga", slug: "cecksatuduatiga" },
                      },
                    },
                  },
                ],
              },
            },
          });
          console.log("Created sample MediaItem:", mediaItem.id, mediaItem.mediaUrl);
        }
      }
    } else {
      console.log("vxTwitter response not ok:", res.status);
    }
  } catch (err) {
    console.error("Error extracting sample X link:", err.message);
  }

  // Thêm 1 video sample dọc để trải nghiệm video TikTok
  try {
    const sampleVideoUrl = "https://assets.mixkit.co/videos/preview/mixkit-vertical-view-of-a-neon-sign-at-night-42217-large.mp4";
    const videoItem = await prisma.mediaItem.create({
      data: {
        type: "VIDEO",
        sourceType: "DIRECT_LINK",
        storageMode: "DIRECT_LINK",
        mediaUrl: sampleVideoUrl,
        thumbnailUrl: "https://assets.mixkit.co/videos/preview/mixkit-vertical-view-of-a-neon-sign-at-night-42217-0.jpg",
        title: "Neon Sign Night (Vertical Video)",
        tags: {
          create: [
            {
              tag: {
                connectOrCreate: {
                  where: { slug: "vertical-video" },
                  create: { name: "Vertical_Video", slug: "vertical-video" },
                },
              },
            },
            {
              tag: {
                connectOrCreate: {
                  where: { slug: "neon" },
                  create: { name: "Neon", slug: "neon" },
                },
              },
            },
          ],
        },
      },
    });
    console.log("Created sample video:", videoItem.id);
  } catch (e) {
    console.log("Video sample notice:", e.message);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
