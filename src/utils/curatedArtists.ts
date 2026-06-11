// src/utils/curatedArtists.ts

export interface CuratedArtist {
  id: string;
  name: string;
  image: string;
}

export const curatedArtists: Record<string, CuratedArtist[]> = {
  "k-pop": [
    { id: "6HvZYsbFfjnjFrWF950C9d", name: "NewJeans", image: "https://i.scdn.co/image/ab6761610000e5eb8dae71b664393f38ba91f891" },
    { id: "6YVMFz59CuY7ngCxTxjpxE", name: "aespa", image: "https://i.scdn.co/image/ab6761610000e5eb053bbb910dda6d4ab0618b8b" },
    { id: "6RHTUrRF63xao58xh9FXYJ", name: "IVE", image: "https://i.scdn.co/image/ab6761610000e5ebe9134cc9371327f8238b1840" },
    { id: "3Nrfpe0tUJi4K4DXYWgMUX", name: "BTS", image: "https://i.scdn.co/image/ab6761610000e5ebf80ec63ea7a0ef0fba60957d" },
    { id: "41MozSoPIsD1dJM0CLPjZF", name: "BLACKPINK", image: "https://i.scdn.co/image/ab6761610000e5eb623538b7014238c54ceee056" },
    { id: "7n2Ycct7Beij7Dj7meI4X0", name: "TWICE", image: "https://i.scdn.co/image/ab6761610000e5eb3d8820046fd455b38d644864" },
    { id: "2dIgFjalVxs4ThymZ67YCE", name: "Stray Kids", image: "https://i.scdn.co/image/ab6761610000e5ebf9887d2c9288f0e50a3fd69f" },
    { id: "7nqOGRxlXj7N2JYbgNEjYH", name: "SEVENTEEN", image: "https://i.scdn.co/image/ab6761610000e5eb8da3a229445fd3cd896cdd5c" },
    { id: "1z4g3DjTBBZKhvAroFlhOM", name: "Red Velvet", image: "https://i.scdn.co/image/ab6761610000e5eb02a562ea6b1dc718394010ac" },
    { id: "4SpbR6yFEvexJuaBpgAU5p", name: "LE SSERAFIM", image: "https://i.scdn.co/image/ab6761610000e5ebd4037f03c5f92e7e6ea89b9e" },
    { id: "2KC9Qb60EaY0kW4eH68vr3", name: "ITZY", image: "https://i.scdn.co/image/ab6761610000e5eba60be8af61d6184cd0402f80" },
    { id: "0ghlgldX5Dd6720Q3qFyQB", name: "TOMORROW X TOGETHER", image: "https://i.scdn.co/image/ab6761610000e5eb54fc4bff90d96d3ef0179e62" },
    { id: "5t5FqBwTcgKTaWmfEbwQY9", name: "ENHYPEN", image: "https://i.scdn.co/image/ab6761610000e5eb590b808769f5826ce94d1dd4" }
  ],
  "pop": [
    { id: "06HL4z0CvFAxyc27GXpf02", name: "Taylor Swift", image: "https://i.scdn.co/image/ab6761610000e5ebe2e8e7ff002a4afda1c7147e" },
    { id: "66CXWjxzNUsdJxJ2JdwvnR", name: "Ariana Grande", image: "https://i.scdn.co/image/ab6761610000e5eb766397ec42a573a53eb5fb87" },
    { id: "6qqNVTkY8uBg9cP3Jd7DAH", name: "Billie Eilish", image: "https://i.scdn.co/image/ab6761610000e5eb4a21b4760d2ecb7b0dcdc8da" },
    { id: "0du5cEVh5yTK9QJze8zA0C", name: "Bruno Mars", image: "https://i.scdn.co/image/ab6761610000e5ebc7688aad1bf03986934d7e26" },
    { id: "6eUKZXaKkcviH0Ku9w2n3V", name: "Ed Sheeran", image: "https://i.scdn.co/image/ab6761610000e5ebd55c95ad400aed87da52daec" },
    { id: "1Xyo4u8uXC1ZmMpatF05PJ", name: "The Weeknd", image: "https://i.scdn.co/image/ab6761610000e5ebc1719ac9e6a75c1c25835018" },
    { id: "6KImCVD70vtIoJWnq6nGn3", name: "Harry Styles", image: "https://i.scdn.co/image/ab6761610000e5ebe309f8c3056a59f20d0968ca" },
    { id: "1McMsnEElThX1knmY4oliG", name: "Olivia Rodrigo", image: "https://i.scdn.co/image/ab6761610000e5ebe654806251e2661def1f4e65" },
    { id: "6M2wZ9GZgrQXHCFfjv46we", name: "Dua Lipa", image: "https://i.scdn.co/image/ab6761610000e5eb0c68f6c95232e716f0abee8d" },
    { id: "1uNFoZAHBGtllmzznpCI3s", name: "Justin Bieber", image: "https://i.scdn.co/image/ab6761610000e5ebaf20f7db5288bce9beede034" },
    { id: "04gDigrS5kc9YWfZHwBETP", name: "Maroon 5", image: "https://i.scdn.co/image/ab6761610000e5ebf8349dfb619a7f842242de77" },
    { id: "53XhwfbYqKCa1cC15pYq2q", name: "Imagine Dragons", image: "https://i.scdn.co/image/ab6761610000e5ebab47d8dae2b24f5afe7f9d38" },
    { id: "4gzpq5DPGxSnKTe4SA8HAU", name: "Coldplay", image: "https://i.scdn.co/image/ab6761610000e5eb1ba8fc5f5c73e7e9313cc6eb" },
    { id: "4dpARuHxo51G3z768sgnrY", name: "Adele", image: "https://i.scdn.co/image/ab6761610000e5eb68f6e5892075d7f22615bd17" }
  ],
  "korean hip hop": [
    { id: "7IrDIIq3j04exsiF3Z7CPg", name: "Beenzino", image: "https://i.scdn.co/image/ab6761610000e5ebff26398cc4399702e8124986" },
    { id: "4XpUIb8uuNlIWVKmgKZXC0", name: "ZICO", image: "https://i.scdn.co/image/ab6761610000e5ebabf246ea3cc5db3a70d97496" },
    { id: "3hvinNZRzTLoREmqFiKr1b", name: "CHANGMO", image: "https://i.scdn.co/image/ab6761610000e5ebbb73111f9404833bd8df8816" },
    { id: "2MtHuR0W2idZdF7x4wddqq", name: "GIRIBOY", image: "https://i.scdn.co/image/ab6761610000e5ebbddc6fbd6f3557379cc671b0" },
    { id: "0Ch0t9gI47Lkal71uQnmV3", name: "JUSTHIS", image: "https://i.scdn.co/image/ab6761610000e5eb49660015d7968cfbe6fbd1b1" },
    { id: "5snNHNlYT2UrtZo5HCJkiw", name: "Epik High", image: "https://i.scdn.co/image/ab6761610000e5eba1875d1827aa452e009137d8" },
    { id: "4XDi67ZENZcbfKnvMnTYsI", name: "Jay Park", image: "https://i.scdn.co/image/ab6761610000e5eb6f5dc265d9c3a0e907360aea" },
    { id: "6a8cUmqOsXmjzq1aWKiVpH", name: "E SENS", image: "https://i.scdn.co/image/ab6761610000e5eb5c6eeacbdfbc00a8940a2e5f" },
    { id: "4nvFFLtv7ZqoTr83387uK4", name: "Dynamicduo", image: "https://i.scdn.co/image/ab6761610000e5eb8f66ec26f9ae0a3238df995e" },
    { id: "5a8EJtOEbUJDF4RX3mKK02", name: "Woo", image: "https://i.scdn.co/image/ab6761610000e5ebc6d18bfd181b078ba9760653" }
  ],
  "hip hop": [
    { id: "2YZyLoL8N0Wb9xBt1NhZWg", name: "Kendrick Lamar", image: "https://i.scdn.co/image/ab6761610000e5eb39ba6dcd4355c03de0b50918" },
    { id: "3TVXtAsR1Inumwj472S9r4", name: "Drake", image: "https://i.scdn.co/image/ab6761610000e5eb4293385d324db8558179afd9" },
    { id: "7dGJo4pcD2V6oG8kP0tJRR", name: "Eminem", image: "https://i.scdn.co/image/ab6761610000e5eba00b11c129b27a88fc72f36b" },
    { id: "246dkjvS1zLTtiykXe5h60", name: "Post Malone", image: "https://i.scdn.co/image/ab6761610000e5ebe17c0aa1714a03d62b5ce4e0" },
    { id: "0Y5tJX12tflao1v6v6RLGa", name: "Travis Scott", image: "https://i.scdn.co/image/ab6761610000e5eb8da829c6cc587ea0b885b57f" },
    { id: "5K4W6rqBFW3y6RMf3PjGCR", name: "Kanye West", image: "https://i.scdn.co/image/ab6761610000e5eb1a8a7e23fcba7a7c8e9b3c08" },
    { id: "6l3HvQ5sa6mNPGH9236vSP", name: "J. Cole", image: "https://i.scdn.co/image/ab6761610000e5eb9c2c5b250e8b9c12ad7fc3d8" },
    { id: "1U1832wVe7jZsCV4LcZ8OI", name: "Tyler, The Creator", image: "https://i.scdn.co/image/ab6761610000e5eb0c1f7ee8d82eef5b18bb98d8" }
  ],
  "korean r&b": [
    { id: "6aLdhHUqgdKE86xbtNmY8g", name: "Crush", image: "https://i.scdn.co/image/ab6761610000e5ebbf0c39864a4e7361818c2a1a" },
    { id: "3eCd0TZrBPm2n9cDG6yWfF", name: "DEAN", image: "https://i.scdn.co/image/ab6761610000e5eb0380068b5097515265c51f4b" },
    { id: "5HenzRvMtSrgtvU16XAoby", name: "Zion.T", image: "https://i.scdn.co/image/ab6761610000e5eb451e705e650fa08297953ef8" },
    { id: "5dCvSnVduaFleCnyy98JMo", name: "Heize", image: "https://i.scdn.co/image/ab6761610000e5eb29117e38caf056aba53cc80c" },
    { id: "3VQDqjQ4wJyw8PzpGdlZpB", name: "Colde", image: "https://i.scdn.co/image/ab6761610000e5eb0d70006fb7127e182921ecd7" },
    { id: "6dhfy4ByARPJdPtMyrUYJK", name: "Yerin Baek", image: "https://i.scdn.co/image/ab6761610000e5eb36fb1d2c40997cd05363de1f" },
    { id: "6UbmqUEgjLA6jAcXwbM1Z9", name: "BIBI", image: "https://i.scdn.co/image/ab6761610000e5ebba83b68a9ffebc68cf5003e1" },
    { id: "7cVZApDoQZpS447nHTsNqu", name: "LEEHI", image: "https://i.scdn.co/image/ab6761610000e5eb3c34da519a773ed07b3d9c44" },
    { id: "0kRAVpQhUUArA8UnYwEdeZ", name: "Kwon Jin Ah", image: "https://i.scdn.co/image/ab6761610000e5ebeb7b71ee305a9fe18a188627" },
    { id: "7bWYN0sHvyH7yv1uefX07U", name: "Jukjae", image: "https://i.scdn.co/image/ab6761610000e5eb3739afa8c364e092180d78c1" }
  ],
  "r&b": [
    { id: "2h93pZq0e7k5yf4dywlkpM", name: "Frank Ocean", image: "https://i.scdn.co/image/ab6761610000e5ebee3123e593174208f9754fab" },
    { id: "7tYKF4w9nC0nq9CsPZTHyP", name: "SZA", image: "https://i.scdn.co/image/ab6761610000e5ebfd0a9fb6c252a3ba44079acf" },
    { id: "5cj0lLjcoR7YOSnhnX0Po5", name: "Doja Cat", image: "https://i.scdn.co/image/ab6761610000e5eb8a0644455ebfa7d3976f5101" },
    { id: "5pKCCKE2ajJHZ9KAiaK11H", name: "Rihanna", image: "https://i.scdn.co/image/ab6761610000e5ebcb565a8e684e3be458d329ac" },
    { id: "6vWDO969PvNqNYHIOW5v0m", name: "Beyoncé", image: "https://i.scdn.co/image/ab6761610000e5eb7eaa373538359164b843f7c0" },
    { id: "20wkY7bu05T27tndMM45Ug", name: "Daniel Caesar", image: "https://i.scdn.co/image/ab6761610000e5eb4d5e4a0dff6e5f7b9f8a3c5e" }
  ],
  "korean rock": [
    { id: "1rpgxJZxZMLnFNc1Jmyov5", name: "YB", image: "https://i.scdn.co/image/ab6761610000e5eb4a10fa9cabfb1c7e0904d336" },
    { id: "2LtEDRKi75vGtsfdy205jX", name: "BOOHWAL", image: "https://i.scdn.co/image/ab67616d0000b273908bb97fac4b58cc51c13716" },
    { id: "6evmYxFbDSIHilUaYC9MhL", name: "JAURIM", image: "https://i.scdn.co/image/ab6761610000e5ebaa6728579a1ee2dbb423e89d" },
    { id: "5WY88tCMFA6J6vqSN3MmDZ", name: "NELL", image: "https://i.scdn.co/image/ab6761610000e5eb7ef39e8e41cfceaa7bea3153" },
    { id: "71kRpwy6xTeG2OXXkRJdkA", name: "Guckkasten", image: "https://i.scdn.co/image/ab6761610000e5eb839d5151ddf105f92ec0d993" },
    { id: "3uk3Jz2yT37niCo3c5GMf2", name: "cherryfilter", image: "https://i.scdn.co/image/ab6761610000e5ebb2b26e7a396cf31c7fdd523b" },
    { id: "0jg8QQ5BExafoPBy7ZyA5t", name: "CRYING NUT", image: "https://i.scdn.co/image/ab6761610000e5eb8ff484a7552bcf7b34f1acbf" },
    { id: "6KhH771vq2X2Aom91nNzpZ", name: "FTISLAND", image: "https://i.scdn.co/image/ab6761610000e5eba52791c5191ef8c055edf551" },
    { id: "6dCz3spfpIvqqqsIoP6wXi", name: "CNBLUE", image: "https://i.scdn.co/image/ab6761610000e5eb08d60631b8e38e4b74679139" },
    { id: "5TnQc2N1iKlFjYD7CPGvFc", name: "DAY6", image: "https://i.scdn.co/image/ab6761610000e5eb6bf26f017d7397f06df7b254" }
  ],
  "rock": [
    { id: "3WrFJ7ztbogyGnTHbHJFl2", name: "The Beatles", image: "https://i.scdn.co/image/ab6761610000e5ebe9348cc01ff5d55971b22433" },
    { id: "4Z8W4fKeB5YxbusRsdQVPb", name: "Radiohead", image: "https://i.scdn.co/image/ab6761610000e5eb4104fbd80f1f795728abbd59" },
    { id: "7Ln80lUS6He07XvHI8qqHH", name: "Arctic Monkeys", image: "https://i.scdn.co/image/ab6761610000e5eb7da39dea0a72f581535fb11f" },
    { id: "0epOFNiUfyON9EYx7Tpr6V", name: "The Strokes", image: "https://i.scdn.co/image/ab6761610000e5ebc3b137793230f4043feb0089" },
    { id: "1dfeR4HaWDbWqFHLkxsg1d", name: "Queen", image: "https://i.scdn.co/image/ab6772690000c46c47488c35a509d42072c23976" },
    { id: "6olE6TJLqED3rqDCT0FyPh", name: "Nirvana", image: "https://i.scdn.co/image/84282c28d851a700132356381fcfbadc67ff498b" },
    { id: "0L8ExT028jH3ddEcZwqJJ5", name: "Red Hot Chili Peppers", image: "https://i.scdn.co/image/ab6761610000e5ebc33cc15260b767ddec982ce8" },
    { id: "7jy3rLJdDQY21OgRLCZ9sD", name: "Foo Fighters", image: "https://i.scdn.co/image/ab6761610000e5eb1db35bc9c01d2b1c151e44ce" },
    { id: "7oPftvlwr6VrsViSDV7fJY", name: "Green Day", image: "https://i.scdn.co/image/ab6761610000e5eb6ff0cd5ef2ecf733804984bb" },
    { id: "6XyY86QOPPrYVGvF9ch6wz", name: "Linkin Park", image: "https://i.scdn.co/image/ab6761610000e5eb527d95dabbe8b8b527e8136f" },
    { id: "12Chz98pHFMPJEknJQMWvI", name: "Muse", image: "https://i.scdn.co/image/ab6761610000e5eb001bed1a54fe90023cae1d1b" },
    { id: "2DaxqgrOhkeH0fpeiQq2f4", name: "Oasis", image: "https://i.scdn.co/image/ab6761610000e5ebb4ddbc39706ef0f2ae0f7c9b" }
  ],
  "korean indie": [
    { id: "6WeDO4GynFmK4OxwkBzMW8", name: "The Black Skirts", image: "https://i.scdn.co/image/ab6761610000e5eb8609536d21beed6769d09d7f" },
    { id: "2SY6OktZyMLdOnscX3DCyS", name: "JANNABI", image: "https://i.scdn.co/image/ab6761610000e5eb776565cc2d97c46f4d000134" },
    { id: "57okaLdCtv3nVBSn5otJkp", name: "HYUKOH", image: "https://i.scdn.co/image/ab6761610000e5eba83b7860635940ed829ee09b" },
    { id: "6zn0ihyAApAYV51zpXxdEp", name: "10CM", image: "https://i.scdn.co/image/ab6761610000e5eb2445af13cb1a8132388cd566" },
    { id: "4k5fFEYgkWYrYvtOK3zVBl", name: "BOL4", image: "https://i.scdn.co/image/ab6761610000e5eb4a970fe13b80298b5621d657" },
    { id: "07OePkse2fcvU9wlVftNMl", name: "SE SO NEON", image: "https://i.scdn.co/image/ab6761610000e5eb27781ac76c7bb43ec6c7d4b2" },
    { id: "7c1HgFDe8ogy5NOZ1ANCJQ", name: "Car, the garden", image: "https://i.scdn.co/image/ab6761610000e5ebc01f9208391fe683603a0617" },
    { id: "2kxVxKOgoefmgkwoHipHsn", name: "Silica Gel", image: "https://i.scdn.co/image/ab6761610000e5eb017f7a68d770a2f115264068" },
    { id: "7bWYN0sHvyH7yv1uefX07U", name: "Jukjae", image: "https://i.scdn.co/image/ab6761610000e5eb3739afa8c364e092180d78c1" },
    { id: "5wVJpXzuKV6Xj7Yhsf2uYx", name: "HANRORO", image: "https://i.scdn.co/image/ab6761610000e5eb2b1eca3debf68d26f7f25816" },
    { id: "6qvVoPGEqNCyYSjYCgfV1v", name: "Choi Yu Ree", image: "https://i.scdn.co/image/ab6761610000e5eb60015f69af4ff23545d30130" },
    { id: "7owveHzN1hmQuw6Ojg4sI3", name: "SURL", image: "https://i.scdn.co/image/ab6761610000e5eb08071cad920ea8bc03969255" },
    { id: "4eh2JeBpQaScfHKKXZh5vO", name: "LUCY", image: "https://i.scdn.co/image/ab6761610000e5eb2cd1196569576dff6dfc70c8" },
    { id: "04L3elxyr0XFua2Ek3domW", name: "sunwoojunga", image: "https://i.scdn.co/image/ab6761610000e5ebde3d93419c1abbc27fd8c57d" },
    { id: "0qQQYIK5Sxnzt72fGyTcvs", name: "Ahn Ye Eun", image: "https://i.scdn.co/image/ab6761610000e5ebd60674b5fff24622ed81f344" }
  ],
  "indie": [
    { id: "5INjqkS1o8h1imAzPqGZBb", name: "Tame Impala", image: "https://i.scdn.co/image/ab6761610000e5ebe412a782245eb20d9626c601" },
    { id: "3AA28KZvwAUcZuOKwyblJQ", name: "Gorillaz", image: "https://i.scdn.co/image/ab6761610000e5ebdd5b57b40cf2aaeccd07835e" },
    { id: "4LLpKhyESsyAXpc4laK94U", name: "Mac Miller", image: "https://i.scdn.co/image/ab6761610000e5ebed3b89aa602145fde71a163a" },
    { id: "324ndHOuu9raw36X448W6k", name: "Clairo", image: "https://i.scdn.co/image/ab6761610000e5eb6dd4bbaceba8c74b0ca3b9c0" },
    { id: "1r1mgR7xyzqp0NJFW8exPX", name: "Phoebe Bridgers", image: "https://i.scdn.co/image/ab6761610000e5eb9c8a3c0f0a76bed4d2ae6f2c" }
  ],
  "electronic": [
    { id: "4tZwfgrHOc3mvqYlEYSvVi", name: "Daft Punk", image: "https://i.scdn.co/image/ab6761610000e5ebd3aa7cc0e419b6c459b08e8e" },
    { id: "711MCcyhmYJ1FSSu7kgLCI", name: "Calvin Harris", image: "https://i.scdn.co/image/ab6761610000e5eb9c27e753c4fcfdb26fda4d38" },
    { id: "1vCvlEMmbt30Njo41M3c4s", name: "Avicii", image: "https://i.scdn.co/image/ab6761610000e5eb44ec6f5caefc54eb4b86dcc0" }
  ],
  "jazz": [
    { id: "0kbwz7265582317GqN9L2b", name: "Miles Davis", image: "https://i.scdn.co/image/ab6761610000e5eba6c5eb5b7ef5f55fe1c2dd27" },
    { id: "1ct7183Njg4a7g882s5S7y", name: "Norah Jones", image: "https://i.scdn.co/image/ab6761610000e5eb267e20b52e14b92e0be4c32c" },
    { id: "7t7183Njg4a7y882s5S77", name: "Laufey", image: "https://i.scdn.co/image/ab6761610000e5eb35d85ba5a5ca2b9fb33461ae" }
  ],
  "ballad": [
    { id: "7jFUYMpMUBDL4JQtMZ5ilc", name: "Sung Si Kyung", image: "https://i.scdn.co/image/ab6761610000e5eb5c85d1892bed878af193285e" },
    { id: "57htMBtzpppc1yoXgjbslj", name: "Park Hyo Shin", image: "https://i.scdn.co/image/ab6761610000e5eb7a7d4f77e962baf427eeea80" },
    { id: "3zYyfrb4r6ZHI5Di0rB9bV", name: "Kim Dong Ryul", image: "https://i.scdn.co/image/ab6761610000e5eb2fb79a6904ec0eb5ab268161" },
    { id: "58BWh3yJrluDugLv0QF0eC", name: "Lee So Ra", image: "https://i.scdn.co/image/ab6761610000e5eb7ef39e8e41cfceaa7bea3153" },
    { id: "4qRXrzUmdy3p33lgvJEzdv", name: "Paul Kim", image: "https://i.scdn.co/image/ab6761610000e5ebab3e74a61b74a0586ee2273e" },
    { id: "6k4r73Wq8nhkCDoUsECL1e", name: "MeloMance", image: "https://i.scdn.co/image/ab6761610000e5eba0e601a6151cf62e4ff2ced2" },
    { id: "7l8rOFwZFQ3G0sgZ7gjGng", name: "Jung Seung Hwan", image: "https://i.scdn.co/image/ab6761610000e5eb70e421846bdd71847716d87d" },
    { id: "4dB2XmMpzPxsMRnt62TbF5", name: "Lim Changjung", image: "https://i.scdn.co/image/ab6761610000e5ebc692592d16471637049a1f90" },
    { id: "20K5puLWHL28ckI4LjieDt", name: "KIM BUMSOO", image: "https://i.scdn.co/image/ab67616d0000b27315c2540717444c37b24ea978" },
    { id: "22oiFjlZPKJ1XphV2et1u1", name: "Naul", image: "https://i.scdn.co/image/ab6761610000e5ebe2bb71041e476cd0a33f3d06" }
  ],
  "trot": [
    { id: "75MOYjGEyyH5U4ZFHOPvxR", name: "Lim Young Woong", image: "https://i.scdn.co/image/ab6761610000e5eb3caf8ee1889c531ed908d173" },
    { id: "1zeaekWal9sG8T6INxaeQM", name: "Jang Yoon-Jeong", image: "https://i.scdn.co/image/ab67616d0000b273b0b789d14ca0bf296033c3fc" },
    { id: "5t5zmsIdTDRqDeI17tilpd", name: "Song Ga In", image: "https://i.scdn.co/image/ab67616d0000b273eef573f704123507522c04f2" },
    { id: "0qDHjPB7TJPxYaQ0CWMEU4", name: "YOUNGTAK", image: "https://i.scdn.co/image/ab67616d0000b2736f4c00ad8867a03ed9a954fe" },
    { id: "1XlyP7FKwWs9j8GTdk5m4k", name: "Lee Chanwon", image: "https://i.scdn.co/image/ab67616d0000b273f6416c314e7699f894c9ce9d" },
    { id: "5LwiBgLTllBUiqQGNiQ7jY", name: "HONG JIN YOUNG", image: "https://i.scdn.co/image/ab6761610000e5eb1509ea5c5453d5edba050412" },
    { id: "5W5z8dxd1mi3fB8aHcv4MK", name: "KIM YONJA", image: "https://i.scdn.co/image/ab67616d0000b273f929be07f02f216ffe63c520" },
    { id: "3Fe5DbLAhIho2Gdc3xr6BC", name: "박군", image: "https://i.scdn.co/image/ab67616d0000b27399f6f62c5bf81d5e46728b56" },
    { id: "2W7So4yo0Edpft65hLhAbR", name: "남진", image: "https://i.scdn.co/image/ab67616d0000b2739d56797532e6988d3d5acc6f" },
    { id: "6w4Xk1ziLyfweN6w3KdhxG", name: "Na Hoon-A", image: "https://i.scdn.co/image/ab67616d0000b2732b7cf00903df9c862bdf9fb6" }
  ],
  "j-pop": [
    { id: "6t17183Njga78y78S578Y", name: "Yoasobi", image: "https://i.scdn.co/image/ab6761610000e5eb51cd8e9e85b6e47695e39c1a" },
    { id: "1ct7218Njg4a7y88s5S79", name: "Kenshi Yonezu", image: "https://i.scdn.co/image/ab6761610000e5eb3ce1dbbfac052c1efaedcd84" },
    { id: "5t7183Njg4a7y882s5S77", name: "Fujii Kaze", image: "https://i.scdn.co/image/ab6761610000e5eb97acc03fef57e29e8ebac5ef" }
  ],
  "classical": [
    { id: "5wVkS4jQ76oG81gP0tJR2", name: "J.S. Bach", image: "https://i.scdn.co/image/ab6761610000e5eb1e7e5baa16a3de63889e9fb2" },
    { id: "4wVkS4jQ76oG81gP0tJR3", name: "Mozart", image: "https://i.scdn.co/image/ab6761610000e5eb3b6c2a9e6b09c30e42c2f7d1" },
    { id: "2wVkS4jQ76oG81gP0tJR4", name: "Beethoven", image: "https://i.scdn.co/image/ab6761610000e5eb9e43c43eba395c5c0b38a5b9" }
  ]
};
