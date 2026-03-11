#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

struct Bid {
    int count;
    int face;
    bool exists;
};

int parse_int_after(const std::string& text, const std::string& key, int fallback) {
    std::size_t key_pos = text.find(key);
    if (key_pos == std::string::npos) {
        return fallback;
    }
    std::size_t colon = text.find(':', key_pos + key.size());
    if (colon == std::string::npos) {
        return fallback;
    }
    std::size_t start = text.find_first_of("-0123456789", colon + 1);
    if (start == std::string::npos) {
        return fallback;
    }
    std::size_t end = text.find_first_not_of("0123456789", start);
    return std::stoi(text.substr(start, end - start));
}

std::vector<int> parse_dice(const std::string& text) {
    std::vector<int> dice;
    std::size_t key_pos = text.find("\"yourDice\"");
    if (key_pos == std::string::npos) {
        return dice;
    }
    std::size_t open = text.find('[', key_pos);
    std::size_t close = text.find(']', open);
    if (open == std::string::npos || close == std::string::npos || close <= open) {
        return dice;
    }

    std::size_t pos = open + 1;
    while (pos < close) {
        std::size_t start = text.find_first_of("0123456789", pos);
        if (start == std::string::npos || start >= close) {
            break;
        }
        std::size_t end = text.find_first_not_of("0123456789", start);
        dice.push_back(std::stoi(text.substr(start, end - start)));
        pos = end;
    }
    return dice;
}

Bid parse_last_bid(const std::string& text) {
    std::size_t key_pos = text.find("\"lastBid\"");
    if (key_pos == std::string::npos) {
        return {0, 0, false};
    }
    std::size_t colon = text.find(':', key_pos);
    std::size_t object_pos = text.find('{', colon);
    std::size_t null_pos = text.find("null", colon);
    if (null_pos != std::string::npos && (object_pos == std::string::npos || null_pos < object_pos)) {
        return {0, 0, false};
    }
    if (object_pos == std::string::npos) {
        return {0, 0, false};
    }
    std::size_t object_end = text.find('}', object_pos);
    if (object_end == std::string::npos) {
        return {0, 0, false};
    }
    std::string bid_text = text.substr(object_pos, object_end - object_pos + 1);
    return {
        parse_int_after(bid_text, "\"count\"", 1),
        parse_int_after(bid_text, "\"face\"", 1),
        true
    };
}

Bid minimum_raise(const Bid& last_bid) {
    if (!last_bid.exists) {
        return {1, 1, true};
    }
    if (last_bid.face < 6) {
        return {last_bid.count, last_bid.face + 1, true};
    }
    return {last_bid.count + 1, 1, true};
}

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) {
            continue;
        }

        std::vector<int> dice = parse_dice(line);
        Bid last_bid = parse_last_bid(line);
        std::vector<int> counts(7, 0);
        for (int die : dice) {
            if (die >= 1 && die <= 6) {
                counts[die]++;
            }
        }

        int best_face = 1;
        for (int face = 2; face <= 6; ++face) {
            if (counts[face] > counts[best_face] || (counts[face] == counts[best_face] && face > best_face)) {
                best_face = face;
            }
        }

        if (last_bid.exists && last_bid.count > counts[best_face] + 2) {
            std::cout << "{\"action\":\"liar\"}" << std::endl;
            continue;
        }

        int count = 1;
        int face = best_face;
        if (last_bid.exists) {
            count = std::max(last_bid.count, counts[best_face]);
            if (!(count > last_bid.count || (count == last_bid.count && face > last_bid.face))) {
                Bid fallback = minimum_raise(last_bid);
                count = fallback.count;
                face = fallback.face;
            }
        }

        std::cout << "{\"action\":\"bid\",\"count\":" << count << ",\"face\":" << face << "}" << std::endl;
    }

    return 0;
}
