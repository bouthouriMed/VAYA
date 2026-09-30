import sys
from PIL import Image
fs=sys.argv[2:]; pre=sys.argv[1]
ims=[Image.open(f'{pre}_{f}.png').convert('RGBA') for f in fs]
w,h=ims[0].size; cols=2; rows=(len(ims)+1)//2
sheet=Image.new('RGB',(w*cols,h*rows),(13,21,18))
for i,im in enumerate(ims): sheet.paste(im,((i%cols)*w,(i//cols)*h),im)
sheet.save('sheet.png')
