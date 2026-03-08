"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchGamerLink = void 0;
const typeorm_1 = require("typeorm");
let MatchGamerLink = class MatchGamerLink {
    id;
    matchId;
    match;
    index;
    gamerId;
    gamer;
    createdAt;
    updatedAt;
};
exports.MatchGamerLink = MatchGamerLink;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], MatchGamerLink.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], MatchGamerLink.prototype, "matchId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Match', (match) => match.links, { nullable: false, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'matchId' }),
    __metadata("design:type", Object)
], MatchGamerLink.prototype, "match", void 0);
__decorate([
    (0, typeorm_1.Column)('tinyint'),
    __metadata("design:type", Number)
], MatchGamerLink.prototype, "index", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], MatchGamerLink.prototype, "gamerId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Gamer', { nullable: false, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'gamerId' }),
    __metadata("design:type", Object)
], MatchGamerLink.prototype, "gamer", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], MatchGamerLink.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], MatchGamerLink.prototype, "updatedAt", void 0);
exports.MatchGamerLink = MatchGamerLink = __decorate([
    (0, typeorm_1.Entity)(),
    (0, typeorm_1.Index)(['matchId', 'index'], { unique: true })
], MatchGamerLink);
//# sourceMappingURL=match-gamer-link.entity.js.map