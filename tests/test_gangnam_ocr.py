import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import gangnam_ocr as O

DATE="2026-11-25"
POST="https://www.threads.com/@gangnambab/post/abcDef"
VIDEO="https://video.cdninstagram.com/v/ticket.mp4"

def item(label, date="Wed, 25 Nov 2026 01:05:00 +0000", url=POST):
    return '<item><title>@gangnambab</title><link>'+url+'</link><pubDate>'+date+'</pubDate><description><![CDATA[<p>'+label+'</p><video><source src="'+VIDEO+'"></video>]]></description></item>'

class MenuOcrTests(unittest.TestCase):
    def test_feed_html_and_seoul_date(self):
        xml='<rss><channel>'+item('오늘의 식단: 제육볶음 김치찌개')+'</channel></rss>'
        parsed=O.parse_feed(xml,DATE)
        self.assertEqual(len(parsed),1)
        self.assertIn('제육볶음',parsed[0]['caption'])
        self.assertEqual(parsed[0]['kind'],'video')
        self.assertEqual(parsed[0]['post_url'],POST)
        self.assertEqual(O.parse_feed(xml,'2026-11-24'),[])

    def test_media_restrictions(self):
        for addr in ('file:///etc/passwd','http://video.cdninstagram.com/test',
            'https://cdninstagram.com.attacker.test/abc',
            'https://127.0.0.1/video.mp4', 'https://example.org/video.mp4',
            'https://a@video.cdninstagram.com/v.mp4'):
            self.assertFalse(O.allowed(addr,media=True))
        self.assertTrue(O.allowed(VIDEO,media=True))
        self.assertFalse(O.allowed('https://example.com/threads/gangnambab'))

    def test_promo_rejected_even_with_menu_keyword(self):
        for text in ('오픈 2주년 행사 식권 10+1', '오늘 메뉴 이벤트 식권 증정 무료',
                     '오늘 메뉴표 할인 쿠폰 행사'):
            m=O.frame_score(text)
            self.assertFalse(m['strong'])
            self.assertTrue(m['promo'])

    def test_genuine_korean_menu_evidence(self):
        text='오늘의 점심 메뉴표\n흑미밥\n제육볶음\n미역국\n배추김치\n샐러드\n'
        m=O.frame_score(text)
        self.assertTrue(m['strong'])
        self.assertTrue(O.frame_verdict([m,m,m])['verified'])

    def test_one_frame_not_enough(self):
        m=O.frame_score('오늘의 식단\n밥\n김치찌개\n제육볶음')
        self.assertFalse(O.frame_verdict([m])['verified'])

    def test_choose_unique_evidence_not_latest_clip(self):
        good=dict(post_url=POST,status='verified',score=30,strong_frames=4)
        promo=dict(post_url=POST+'2',status='unverified',score=0,strong_frames=0)
        self.assertEqual(O.choose_results([promo,good])[:2],('verified',POST))
        other={**good,'post_url':POST+'3','score':25}
        self.assertEqual(O.choose_results([good,other])[0],'ambiguous')

    def test_invalid_post_is_rejected(self):
        self.assertEqual(O.valid_post('https://evil.example/@gangnambab/post/abc'),'')
        self.assertEqual(O.valid_post('https://www.threads.com/t/abc'),'https://www.threads.com/@gangnambab/post/abc')

    def test_entity_payload_not_executed(self):
        text='<rss><!DOCTYPE a [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><channel></channel></rss>'
        with self.assertRaises(ValueError): O.parse_feed(text,DATE)

if __name__ == "__main__":
    unittest.main()
